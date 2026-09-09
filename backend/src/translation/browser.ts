import puppeteer, { type Browser, type HTTPRequest } from "@cloudflare/puppeteer";
import { evidenceFromHTML } from "./extraction.ts";
import { createDNSResolver, normalizePublicURL, validatePublicURL, type DNSResolver } from "./url-policy.ts";
import { TranslationError, createCloudAccessGate, deadlineSignal, throwIfAborted, withinDeadline, type CaptureEvidence, type CaptureTransport, type CloudAccessGate } from "./types.ts";
import type { ExplorationPlanner } from "./astra.ts";

export type BrowserBinding = Parameters<typeof puppeteer.launch>[0];

/** Launches only a fresh, owned session. No user browser profiles or cookies are imported. */
export function createBrowserCaptureTransport(binding: BrowserBinding | undefined, options: { gate?: CloudAccessGate; resolveDNS?: DNSResolver; explore?: ExplorationPlanner; launchBrowser?: (binding: BrowserBinding) => Promise<Browser> } = {}): CaptureTransport {
  const gate = options.gate ?? createCloudAccessGate();
  const resolveDNS = options.resolveDNS ?? createDNSResolver(gate);
  return {
    async capture(input, run) {
      gate.assertAllowed("browser");
      if (!binding) throw new TranslationError("BROWSER_NOT_CONFIGURED", "Browser Run binding is not configured.", 503);
      const signal = deadlineSignal(run.deadlineAt, run.signal);
      const url = await validatePublicURL(input, resolveDNS, signal);
      let actions = 0;
      const action = async (stage: string, message: string) => {
        throwIfAborted(signal);
        if (++actions > 8) throw new TranslationError("ACTION_LIMIT", "The eight-action capture limit was reached.");
        await run.onProgress?.({ type: "status", stage, message });
      };
      const browser = await (options.launchBrowser ? options.launchBrowser(binding) : puppeteer.launch(binding, { keep_alive: 60_000 }));
      let closing: Promise<void> | undefined;
      const close = () => { closing ??= browser.close(); return closing; };
      const abort = () => { void close().catch(() => undefined); };
      signal.addEventListener("abort", abort, { once: true });
      try {
        throwIfAborted(signal);
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
        await page.setBypassServiceWorker(true);
        let navigating = false;
        let navigationOrigin: string | undefined;
        const dnsCache = new Map<string, Promise<URL>>();
        const validateRequest = (requestURL: string) => {
          const candidate = normalizePublicURL(requestURL);
          const key = candidate.origin;
          let check = dnsCache.get(key);
          if (!check) { check = validatePublicURL(candidate, resolveDNS, signal); dnsCache.set(key, check); }
          return check;
        };
        await page.setRequestInterception(true);
        const handleRequest = async (request: HTTPRequest) => {
          try {
            if (signal.aborted || !["GET", "HEAD"].includes(request.method())) { await request.abort(); return; }
            const requested = normalizePublicURL(request.url());
            if (request.isNavigationRequest() && (request.frame() !== page.mainFrame() || !navigating || (navigationOrigin && requested.origin !== navigationOrigin))) { await request.abort(); return; }
            if (["media", "websocket", "eventsource"].includes(request.resourceType())) { await request.abort(); return; }
            await validateRequest(request.url());
            if (!request.isInterceptResolutionHandled()) await request.continue();
          } catch { if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => undefined); }
        };
        page.on("request", request => { void handleRequest(request); });
        page.on("dialog", dialog => { void dialog.dismiss(); });
        // Page script cannot open a second browsing context or long-lived socket.
        await page.evaluateOnNewDocument(() => {
          (globalThis as unknown as { open: () => null }).open = () => null;
          Object.defineProperty(globalThis, "WebSocket", { value: class { constructor() { throw new Error("Sockets unavailable during public capture"); } } });
          Object.defineProperty(globalThis, "EventSource", { value: class { constructor() { throw new Error("Event streams unavailable during public capture"); } } });
        });
        const navigate = async (target: URL, sameOrigin?: string) => {
          await action("navigating", "Loading an approved public source page.");
          await validatePublicURL(target, resolveDNS, signal);
          navigating = true; navigationOrigin = sameOrigin;
          try {
            const response = await withinDeadline(page.goto(target.href, { waitUntil: "domcontentloaded", timeout: Math.min(20_000, Math.max(1, run.deadlineAt - Date.now())) }), signal);
            if (!response || !response.ok()) throw new TranslationError("SOURCE_UNAVAILABLE", "The source did not return an accessible public page.", 502);
          } finally { navigating = false; }
          const actual = await validatePublicURL(page.url(), resolveDNS, signal);
          if (sameOrigin && actual.origin !== sameOrigin) throw new TranslationError("CROSS_ORIGIN_EXPLORATION", "Related-page exploration must stay on the same origin.");
        };
        await navigate(url);
        await page.waitForFunction(() => {
          const document = (globalThis as unknown as { document?: { body?: { innerText?: string } } }).document;
          return (document?.body?.innerText?.length ?? 0) > 80;
        }, { timeout: Math.min(4000, Math.max(1, run.deadlineAt - Date.now())) }).catch(() => undefined);
        try {
          const session = await page.createCDPSession();
          const live = await session.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 90_000 });
          if (new URL(live.devtoolsFrontendUrl).protocol === "https:") await run.onProgress?.({ type: "liveView", url: live.devtoolsFrontendUrl });
        } catch {
          await run.onProgress?.({ type: "status", stage: "liveViewUnavailable", message: "Live View is unavailable; continuing source inspection." });
        }
        const inspect = async (): Promise<CaptureEvidence> => {
          await action("inspecting", "Reading the rendered source content and links.");
          const evidence = evidenceFromHTML(await withinDeadline(page.content(), signal), page.url(), run.deadlineAt);
          evidence.captureProfile = { id: "public-desktop-v1", viewport: { width: 1280, height: 900 } };
          if (evidence.text.length < 80 || /^(just a moment|access denied|verify you are human|sign in to continue)/i.test(evidence.title)) throw new TranslationError("SOURCE_BLOCKED", "The source is blocked, requires sign-in, or has insufficient public content.");
          return evidence;
        };
        let primary = await inspect();
        if (options.explore && run.purpose !== "revalidate" && run.deadlineAt - Date.now() > 35_000) {
          await run.onProgress?.({ type: "status", stage: "planning", message: "Astra is selecting any additional source inspection." });
          const plan = await withinDeadline(options.explore(primary, signal), signal);
          const relatedPages: NonNullable<CaptureEvidence["relatedPages"]> = [];
          let opened = false;
          for (const step of plan) {
            if (step.kind === "scroll") {
              await action("scrolling", "Scrolling to inspect additional source content.");
              await page.evaluate(amount => (globalThis as unknown as { scrollBy(x: number, y: number): void }).scrollBy(0, amount), step.amount);
              const update = await inspect();
              if (!opened) primary = update;
            } else {
              if (opened) throw new TranslationError("PAGE_LIMIT", "Only one related page may be inspected.");
              const related = normalizePublicURL(step.url);
              if (related.origin !== new URL(primary.sourceURL).origin || !primary.links.some(link => link.url === related.href)) throw new TranslationError("UNSAFE_EXPLORATION", "Exploration target is not a same-origin source link.");
              opened = true;
              await navigate(related, new URL(primary.sourceURL).origin);
              const evidence = await inspect();
              relatedPages.push({ sourceURL: evidence.sourceURL, title: evidence.title, text: evidence.text.slice(0, 10_000) });
            }
          }
          if (relatedPages.length) primary.relatedPages = relatedPages;
        }
        return primary;
      } finally {
        signal.removeEventListener("abort", abort);
        try {
          await close();
          await run.onProgress?.({ type: "status", stage: "captured", message: "Source capture is complete and the temporary browser is closed." });
        } catch {
          throw new TranslationError("BROWSER_CLEANUP_FAILED", "Unable to confirm temporary browser closure.", 502);
        }
      }
    },
  };
}
