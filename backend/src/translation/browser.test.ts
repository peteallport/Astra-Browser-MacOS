import test from "node:test";
import assert from "node:assert/strict";
import type { Browser } from "@cloudflare/puppeteer";
import { createBrowserCaptureTransport, isChallengeTitle } from "./browser.ts";
import { createCloudAccessGate, TranslationError } from "./types.ts";
import type { ExplorationPlanner } from "./astra.ts";

const SOURCE = "https://fixture.example.com/primary";
const RELATED = "https://fixture.example.com/related";
const html = (title = "Public fixture article") => `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>This is a synthetic public source fixture with enough readable text to exercise browser acquisition without connecting to any remote service.</p><a href="/related">Related article</a></body></html>`;
const never = <T>(): Promise<T> => new Promise(() => {});
type Overrides = {
  content?: (url: string) => Promise<string>;
  navigate?: (url: string) => Promise<{ status: number; actualURL?: string }>;
  close?: () => Promise<void>;
  setup?: () => Promise<void>;
  liveView?: () => Promise<{ devtoolsFrontendUrl: string }>;
  explore?: ExplorationPlanner;
};
function fixture(overrides: Overrides = {}) {
  let currentURL = SOURCE;
  let closes = 0;
  const stages: string[] = [];
  const liveViews: string[] = [];
  const page = {
    async setViewport() {}, async setBypassServiceWorker() {}, async setRequestInterception() {}, on() {},
    async evaluateOnNewDocument() {}, async waitForFunction() {}, async evaluate() {},
    async goto(url: string) {
      const result = await overrides.navigate?.(url) ?? { status: 200 };
      currentURL = result.actualURL ?? url;
      return { ok: () => result.status >= 200 && result.status < 300, status: () => result.status };
    },
    url: () => currentURL,
    async content() { return overrides.content ? overrides.content(currentURL) : html(); },
    async createCDPSession() { return { async send() { return overrides.liveView ? overrides.liveView() : { devtoolsFrontendUrl: "https://viewer.example.com/local-fixture" }; } }; },
  };
  const browser = {
    async close() { closes++; await overrides.close?.(); },
    async createBrowserContext() { await overrides.setup?.(); return { async newPage() { return page; } }; },
  } as unknown as Browser;
  const transport = createBrowserCaptureTransport({ fetch: async () => { throw new Error("Remote calls are forbidden in local fixture tests"); } }, {
    gate: createCloudAccessGate(true), resolveDNS: async () => ["8.8.8.8"], launchBrowser: async () => browser, ...(overrides.explore ? { explore: overrides.explore } : {}),
  });
  return {
    browser, stages, liveViews, closes: () => closes,
    capture: (options: { signal?: AbortSignal; deadlineAt?: number } = {}) => transport.capture(new URL(SOURCE), {
      deadlineAt: options.deadlineAt ?? Date.now() + 90_000, ...(options.signal ? { signal: options.signal } : {}),
      onProgress(event) { if (event.type === "status") stages.push(event.stage); else liveViews.push(event.url); },
    }),
  };
}
const openRelated: ExplorationPlanner = async () => [{ kind: "open", url: RELATED }];

test("observed challenge titles cannot become native source evidence", async () => {
  for (const title of ["Verifying your browser", "  Verifying your browser...", "Verifying the browser", "Just a moment...", "Access denied", "Sign in to continue", "Attention required", "Security verification"]) assert.equal(isChallengeTitle(title), true);
  assert.equal(isChallengeTitle("How browser verification works"), false);
  const run = fixture({ content: async () => html("Verifying your browser") });
  await assert.rejects(run.capture(), { code: "SOURCE_BLOCKED" });
  assert.equal(run.closes(), 1);
  assert.ok(!run.stages.includes("captured"));
});

test("an unavailable or challenged optional page retains readable primary evidence", async () => {
  for (const status of [401, 403, 404, 429, 503, 200]) {
    const run = fixture({ explore: openRelated,
      navigate: async url => ({ status: url === RELATED ? status : 200 }),
      content: async url => html(url === RELATED ? "Verifying your browser" : undefined),
    });
    const evidence = await run.capture();
    assert.equal(evidence.sourceURL, SOURCE);
    assert.equal(evidence.title, "Public fixture article");
    assert.equal(evidence.relatedPages, undefined);
    assert.ok(run.stages.includes("relatedPageUnavailable"));
    assert.equal(run.stages.at(-1), "captured");
  }
});

test("optional inspection never hides unsafe redirects, cancellation, or browser faults", async () => {
  const redirect = fixture({ explore: openRelated, navigate: async url => ({ status: 200, actualURL: url === RELATED ? "https://other.example.com/" : url }) });
  await assert.rejects(redirect.capture(), { code: "CROSS_ORIGIN_EXPLORATION" });
  const privateRedirect = fixture({ explore: openRelated, navigate: async url => ({ status: 200, actualURL: url === RELATED ? "http://127.0.0.1/" : url }) });
  await assert.rejects(privateRedirect.capture(), error => error instanceof TranslationError && error.code.startsWith("UNSAFE_"));
  const controller = new AbortController();
  const cancelled = fixture({ explore: openRelated, navigate: async url => {
    if (url === RELATED) controller.abort();
    return { status: 200 };
  } });
  await assert.rejects(cancelled.capture({ signal: controller.signal }), error => error instanceof TranslationError && /CANCELLED/.test(error.code));
  const broken = fixture({ explore: openRelated, navigate: async url => {
    if (url === RELATED) throw new Error("fixture protocol disconnection");
    return { status: 200 };
  } });
  await assert.rejects(broken.capture(), { code: "SOURCE_NAVIGATION_FAILED" });
});

test("cleanup cannot replace the original challenge failure", async () => {
  const run = fixture({ content: async () => html("Verifying your browser"), close: async () => { throw new Error("fixture cleanup failure"); } });
  await assert.rejects(run.capture(), { code: "SOURCE_BLOCKED" });
  assert.ok(!run.stages.includes("captured"));
});

test("otherwise successful capture fails if browser closure cannot be confirmed", async () => {
  const run = fixture({ close: async () => { throw new Error("fixture cleanup failure"); } });
  await assert.rejects(run.capture(), { code: "BROWSER_CLEANUP_FAILED" });
  assert.ok(!run.stages.includes("captured"));
});

test("hung setup, Live View and closure settle by the overall deadline", async () => {
  for (const overrides of [{ setup: never<void> }, { liveView: never<{ devtoolsFrontendUrl: string }> }, { close: never<void> }]) {
    const run = fixture(overrides);
    const started = Date.now();
    await assert.rejects(run.capture({ deadlineAt: started + 50 }));
    assert.ok(Date.now() - started < 1500, "an ignored abort must not leave capture hanging");
    assert.equal(run.closes(), 1);
    assert.ok(!run.stages.includes("captured"));
  }
});

test("cancelled launch closes a session that arrives after the caller stopped waiting", async () => {
  let finishLaunch!: (browser: Browser) => void;
  const launch = new Promise<Browser>(resolve => { finishLaunch = resolve; });
  const controller = new AbortController();
  const run = fixture();
  const transport = createBrowserCaptureTransport({ fetch: async () => new Response() }, {
    gate: createCloudAccessGate(true), resolveDNS: async () => ["8.8.8.8"], launchBrowser: () => launch,
  });
  const pending = transport.capture(new URL(SOURCE), { deadlineAt: Date.now() + 90_000, signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  await assert.rejects(pending);
  finishLaunch(run.browser);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(run.closes(), 1);
});

test("a late Live View response cannot reopen the viewer after completed capture", async () => {
  let finishLiveView!: (value: { devtoolsFrontendUrl: string }) => void;
  const live = new Promise<{ devtoolsFrontendUrl: string }>(resolve => { finishLiveView = resolve; });
  const run = fixture({ liveView: () => live });
  const evidence = await run.capture();
  assert.equal(evidence.sourceURL, SOURCE);
  assert.ok(run.stages.includes("liveViewUnavailable"));
  assert.equal(run.stages.at(-1), "captured");
  assert.equal(run.closes(), 1);
  finishLiveView({ devtoolsFrontendUrl: "https://viewer.example.com/expired-local-fixture" });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(run.liveViews, []);
});

test("Browser Run launch rate limits return a sanitized actionable error", async () => {
  const transport = createBrowserCaptureTransport({ fetch: async () => new Response() }, {
    gate: createCloudAccessGate(true), resolveDNS: async () => ["8.8.8.8"],
    launchBrowser: async () => { throw Object.assign(new Error("SENSITIVE_PROVIDER_FIXTURE"), { status: 429 }); },
  });
  await assert.rejects(transport.capture(new URL(SOURCE), { deadlineAt: Date.now() + 1000 }), error => {
    assert.ok(error instanceof TranslationError);
    assert.equal(error.code, "BROWSER_RATE_LIMITED");
    assert.equal(error.status, 429);
    assert.ok(!error.message.includes("SENSITIVE_PROVIDER_FIXTURE"));
    return true;
  });
});
