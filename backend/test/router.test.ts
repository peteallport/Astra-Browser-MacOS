import test from "node:test";
import assert from "node:assert/strict";
import { MemoryArtifactStore, R2ArtifactStore, publishBundle } from "../src/artifacts.ts";
import { APIError, pageKeyFor, revisionOf, type PageManifest } from "../src/protocol.ts";
import { createRouter } from "../src/router.ts";
import { fixtureOutput } from "../src/local-fixture.ts";
import { createBundle, validateBundle } from "../src/validation.ts";
import { TranslationError } from "../src/translation/types.ts";

const source = "https://example.com/reading";
const start = Date.parse("2026-09-08T20:00:00Z");
const request = (path: string, body?: unknown, signal?: AbortSignal) => new Request(`http://localhost${path}`, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
function ready(text: string): { manifest: PageManifest } {
  const match = text.match(/event: ready\ndata: ([^\n]+)/);
  assert.ok(match, text);
  return JSON.parse(match[1]!);
}
function setup(options: { gate?: () => void; delay?: number; failRefresh?: boolean; drift?: boolean } = {}) {
  let clock = start;
  let captures = 0;
  let compiles = 0;
  let lastPurpose = "";
  const store = new MemoryArtifactStore();
  const handle = createRouter({ store, now: () => clock, assertExecutionAllowed: options.gate ?? (() => {}), mode: "local-test-fixture",
    pipeline: {
      async capture(url, run) {
        captures++; lastPurpose = run.purpose ?? "";
        if (options.delay) await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.delay);
          run.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
        });
        return { sourceURL: url, capturedAt: new Date(clock).toISOString(), at: clock };
      },
      async compile(evidence) { compiles++; return fixtureOutput(evidence.sourceURL, evidence.at); },
      reextract(evidence) {
        if (options.failRefresh) throw new APIError("SOURCE_CHANGED", "Cannot extract this source.", 422);
        if (options.drift) throw new APIError("RECIPE_DRIFT", "Recipe no longer matches.", 422);
        return fixtureOutput(evidence.sourceURL, evidence.at).content;
      },
    },
  });
  return { handle, store, advance(ms: number) { clock += ms; }, get captures() { return captures; }, get compiles() { return compiles; }, get lastPurpose() { return lastPurpose; } };
}

test("approval gate returns SSE error before acquisition and R2 gate precedes binding access", async () => {
  const block = () => { throw new APIError("CLOUD_APPROVAL_REQUIRED", "Approval required.", 503); };
  const app = setup({ gate: block });
  const response = await app.handle(request("/resolve", { url: source }));
  const body = await response.text();
  assert.match(body, /event: error/); assert.match(body, /CLOUD_APPROVAL_REQUIRED/); assert.equal(app.captures, 0);
  let bindingCalls = 0;
  const r2 = new R2ArtifactStore({ get() { bindingCalls++; throw Error("Should not run"); } } as never, block);
  await assert.rejects(() => r2.getManifest("a".repeat(64)), /Approval required/);
  assert.equal(bindingCalls, 0);
});

test("resolve publishes a validated immutable bundle and conditional manifest", async () => {
  const app = setup();
  const result = ready(await (await app.handle(request("/resolve", { url: `${source}#section` }))).text());
  assert.equal(result.manifest.pageKey, await pageKeyFor(source));
  const manifest = await app.handle(request(`/pages/${result.manifest.pageKey}/manifest`));
  assert.equal(manifest.status, 200);
  const etag = manifest.headers.get("etag")!;
  const conditional = new Request(`http://localhost/pages/${result.manifest.pageKey}/manifest`, { headers: { "if-none-match": etag } });
  assert.equal((await app.handle(conditional)).status, 304);
  const artifact = await app.handle(request(result.manifest.bundleURL));
  assert.equal(artifact.status, 200);
  assert.match(artifact.headers.get("cache-control")!, /immutable/);
  const bundle = await artifact.json();
  await validateBundle(bundle);
  assert.equal(await revisionOf(bundle), result.manifest.bundleRevision);
});

test("simultaneous resolve requests share one acquisition and compiler, then hit cache", async () => {
  const app = setup({ delay: 15 });
  const results = await Promise.all([1, 2].map(async () => ready(await (await app.handle(request("/resolve", { url: source }))).text())));
  assert.equal(results[0]!.manifest.bundleRevision, results[1]!.manifest.bundleRevision);
  assert.equal(app.captures, 1); assert.equal(app.compiles, 1);
  ready(await (await app.handle(request("/resolve", { url: source }))).text());
  assert.equal(app.captures, 1);
});

test("source refresh preserves layout and recipe, checks cadence, and makes no compiler call", async () => {
  const app = setup();
  const initial = ready(await (await app.handle(request("/resolve", { url: source }))).text()).manifest;
  const early = await (await app.handle(request(`/pages/${initial.pageKey}/revalidate`, {}))).json();
  assert.equal(early.changed, false); assert.equal(app.captures, 1);
  app.advance(60_000);
  const updated = await (await app.handle(request(`/pages/${initial.pageKey}/revalidate`, {}))).json();
  assert.equal(updated.changed, true);
  assert.equal(updated.manifest.specRevision, initial.specRevision);
  assert.equal(updated.manifest.recipeRevision, initial.recipeRevision);
  assert.notEqual(updated.manifest.contentRevision, initial.contentRevision);
  assert.equal(app.compiles, 1); assert.equal(app.lastPurpose, "revalidate");
});

test("unchanged source check advances freshness without changing the bundle revision", async () => {
  const store = new MemoryArtifactStore();
  let clock = start;
  const output = fixtureOutput(source, start);
  const app = createRouter({ store, now: () => clock, assertExecutionAllowed() {}, pipeline: {
    async capture(url) { return { sourceURL: url, capturedAt: new Date(clock).toISOString() }; },
    async compile() { return output; }, reextract() { return output.content; },
  } });
  const initial = ready(await (await app(request("/resolve", { url: source }))).text()).manifest;
  clock += 60_000;
  const updated = await (await app(request(`/pages/${initial.pageKey}/revalidate`, {}))).json();
  assert.equal(updated.changed, false); assert.equal(updated.manifest.bundleRevision, initial.bundleRevision);
  assert.notEqual(updated.manifest.sourceCheckedAt, initial.sourceCheckedAt);
});

test("failed refresh preserves last-good manifest; recipe drift alone triggers recompile", async () => {
  const failed = setup({ failRefresh: true });
  const previous = ready(await (await failed.handle(request("/resolve", { url: source }))).text()).manifest;
  failed.advance(60_000);
  assert.equal((await failed.handle(request(`/pages/${previous.pageKey}/revalidate`, {}))).status, 422);
  assert.deepEqual((await failed.store.getManifest(previous.pageKey))!.manifest, previous);
  const repair = setup({ drift: true });
  const first = ready(await (await repair.handle(request("/resolve", { url: source }))).text()).manifest;
  repair.advance(60_000);
  assert.equal((await repair.handle(request(`/pages/${first.pageKey}/revalidate`, {}))).status, 200);
  assert.equal(repair.compiles, 2);
});

test("cancelling all subscribers aborts acquisition and publishes no artifact", async () => {
  const app = setup({ delay: 1000 });
  const controller = new AbortController();
  const response = await app.handle(request("/resolve", { url: source }, controller.signal));
  const reading = response.text();
  await new Promise(resolve => setTimeout(resolve, 15));
  controller.abort();
  await reading;
  assert.equal(app.compiles, 0);
  assert.equal(await app.store.getManifest(await pageKeyFor(source)), null);
});

test("atomic publication rejects stale writers; invalid component graphs and source identity fail", async () => {
  const store = new MemoryArtifactStore();
  const key = await pageKeyFor(source);
  const bundle = await createBundle(key, source, new Date(start).toISOString(), fixtureOutput(source, start));
  const first = await publishBundle(store, bundle, new Date(start).toISOString(), null);
  const secondBundle = await createBundle(key, source, new Date(start + 60_000).toISOString(), fixtureOutput(source, start + 60_000));
  const stale = await publishBundle(store, secondBundle, new Date(start + 60_000).toISOString(), null);
  assert.equal(stale.published, false); assert.equal(stale.manifest.bundleRevision, first.manifest.bundleRevision);
  await assert.rejects(() => createBundle("a".repeat(64), source, new Date(start).toISOString(), fixtureOutput(source, start)), /Page key/);
  const invalid = fixtureOutput(source, start);
  invalid.spec.messages[1] = { version: "v0.9", updateComponents: { surfaceId: "page", components: [{ id: "root", component: "Column", children: ["root"] }] } };
  await assert.rejects(() => createBundle(key, source, new Date(start).toISOString(), invalid), /cyclic/);
});

test("finance route is real source HTML and health never claims cloud verification", async () => {
  const app = setup();
  const finance = await app.handle(request("/demo/finance"));
  assert.equal(finance.status, 200); assert.match(await finance.text(), /SIMULATED QUOTES/);
  const health = await (await app.handle(request("/health"))).json();
  assert.equal(health.cloudVerified, false); assert.equal(health.mode, "local-test-fixture");
});

test("sanitized translation errors retain SSE and HTTP diagnostics without exposing arbitrary provider errors", async () => {
  const store = new MemoryArtifactStore();
  let compilationError: Error = new TranslationError("MODEL_MISMATCH", "The provider did not confirm the requested Astra model.", 502);
  let refresh = false;
  const app = createRouter({ store, now: () => start + 60_000, assertExecutionAllowed() {}, pipeline: {
    async capture(url) {
      if (refresh) throw new TranslationError("UNSAFE_DNS", "The public source resolved to a disallowed destination.", 422);
      return { sourceURL: url, capturedAt: new Date(start).toISOString() };
    },
    async compile() { throw compilationError; },
    reextract() { throw Error("Unexpected extraction"); },
  } });
  const modelFailure = await (await app(request("/resolve", { url: source }))).text();
  assert.match(modelFailure, /event: error\ndata: \{"code":"MODEL_MISMATCH","message":"The provider did not confirm the requested Astra model\."\}/);
  assert.doesNotMatch(modelFailure, /CONVERSION_FAILED|event: ready/);

  // Only our typed, deliberately sanitized error is public; a same-name provider error stays opaque.
  compilationError = Object.assign(new Error("PRIVATE_PROVIDER_BODY"), { name: "TranslationError", code: "ASTRA_UPSTREAM_ERROR", status: 502 });
  const unknownFailure = await (await app(request("/resolve", { url: source }))).text();
  assert.match(unknownFailure, /CONVERSION_FAILED/);
  assert.doesNotMatch(unknownFailure, /PRIVATE_PROVIDER_BODY|ASTRA_UPSTREAM_ERROR/);

  const key = await pageKeyFor(source);
  const bundle = await createBundle(key, source, new Date(start).toISOString(), fixtureOutput(source, start));
  const previous = await publishBundle(store, bundle, new Date(start).toISOString(), null);
  refresh = true;
  const dnsFailure = await app(request(`/pages/${key}/revalidate`, {}));
  assert.equal(dnsFailure.status, 422);
  assert.deepEqual(await dnsFailure.json(), { error: { code: "UNSAFE_DNS", message: "The public source resolved to a disallowed destination." } });
  assert.deepEqual((await store.getManifest(key))!.manifest, previous.manifest);
});
