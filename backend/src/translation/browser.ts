import puppeteer, { type Browser, type HTTPRequest } from "@cloudflare/puppeteer";
import { evidenceFromHTML } from "./extraction.ts";
import { createDNSResolver, normalizePublicURL, validatePublicURL, type DNSResolver } from "./url-policy.ts";
import { TranslationError, createCloudAccessGate, deadlineSignal, throwIfAborted, withinDeadline, type CaptureEvidence, type CaptureTransport, type CloudAccessGate } from "./types.ts";
import type { ExplorationPlanner } from "./astra.ts";
import { isChallengeTitle } from "./challenge.ts";
export { isChallengeTitle } from "./challenge.ts";

export type BrowserBinding = Parameters<typeof puppeteer.launch>[0];

function browserError(error: unknown, code: string, message: string): TranslationError {
  if (error instanceof TranslationError) return error;
  if (typeof error === "object" && error !== null && "status" in error && error.status === 429) {
    return new TranslationError("BROWSER_RATE_LIMITED", "Browser Run is temporarily at its session or launch limit. Try again shortly.", 429);
  }
  return new TranslationError(code, message, 502);
}

/** A Puppeteer operation may ignore AbortSignal; bound the await and consume late rejection. */
async function bounded<T>(work: () => Promise<T>, timeoutMs: number, timeoutError: TranslationError, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  if (timeoutMs <= 0) throw timeoutError;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  try {
    return await withinDeadline(Promise.resolve().then(work), combined);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.signal.aborted) throw timeoutError;
    throw error;
  } finally { clearTimeout(timer); }
}

/** Launches only a fresh, owned session. No user browser profiles or cookies are imported. */
export function createBrowserCaptureTransport(binding: BrowserBinding | undefined, options: { gate?: CloudAccessGate; resolveDNS?: DNSResolver; explore?: ExplorationPlanner; launchBrowser?: (binding: BrowserBinding) => Promise<Browser> } = {}): CaptureTransport {
  const gate = options.gate ?? createCloudAccessGate();
  const resolveDNS = options.resolveDNS ?? createDNSResolver(gate);
  return {
    async capture(input, run) {
      gate.assertAllowed("browser");
      if (!binding) throw new TranslationError("BROWSER_NOT_CONFIGURED", "Browser Run binding is not configured.", 503);
      const signal = deadlineSignal(run.deadlineAt, run.signal);
      const remaining = (maximum: number) => Math.min(maximum, Math.max(0, run.deadlineAt - Date.now()));
      const call = <T>(work: () => Promise<T>, maximum: number, code: string, message: string) => bounded(work, remaining(maximum), new TranslationError(code, message, 504), signal);
      const progress = async (stage: string, message: string) => {
        await withinDeadline(Promise.resolve(run.onProgress?.({ type: "status", stage, message })), signal);
      };
      const url = await withinDeadline(validatePublicURL(input, resolveDNS, signal), signal);
      let actions = 0;
      const action = async (stage: string, message: string) => {
        throwIfAborted(signal);
        if (++actions > 8) throw new TranslationError("ACTION_LIMIT", "The eight-action capture limit was reached.");
        await progress(stage, message);
      };
      const launch = Promise.resolve().then(() => options.launchBrowser ? options.launchBrowser(binding) : puppeteer.launch(binding, { keep_alive: 60_000 }));
      let browser: Browser;
      try {
        browser = await call(() => launch, 15_000, "BROWSER_LAUNCH_TIMEOUT", "Browser Run did not start a session in time.");
      } catch (error) {
        // A timed-out launch can still return a session later. Close only that owned session.
        void launch.then(lateBrowser => lateBrowser.close()).catch(() => undefined);
        throw browserError(error, "BROWSER_LAUNCH_FAILED", "Browser Run could not start a temporary session.");
      }
      let closing: Promise<void> | undefined;
      const close = () => { closing ??= Promise.resolve().then(() => browser.close()); return closing; };
      const abort = () => { void close().catch(() => undefined); };
      signal.addEventListener("abort", abort, { once: true });
      let captureFailed = false;
      try {
        throwIfAborted(signal);
        const page = await call(async () => {
          const context = await browser.createBrowserContext();
          const page = await context.newPage();
          await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
          await page.setBypassServiceWorker(true);
          await page.setRequestInterception(true);
          return page;
        }, 15_000, "BROWSER_SETUP_TIMEOUT", "The temporary browser did not finish setup in time.").catch(error => { throw browserError(error, "BROWSER_SETUP_FAILED", "The temporary browser could not be prepared."); });
        let navigating = false;
        let navigationOrigin: string | undefined;
        let navigationFailure: TranslationError | undefined;
        const dnsCache = new Map<string, Promise<URL>>();
        const validateRequest = (requestURL: string) => {
          const candidate = normalizePublicURL(requestURL);
          const key = candidate.origin;
          let check = dnsCache.get(key);
          if (!check) { check = validatePublicURL(candidate, resolveDNS, signal); dnsCache.set(key, check); }
          return check;
        };
        const handleRequest = async (request: HTTPRequest) => {
          const mainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();
          try {
            if (signal.aborted || !["GET", "HEAD"].includes(request.method())) { await request.abort(); return; }
            const requested = normalizePublicURL(request.url());
            if (request.isNavigationRequest() && (!mainNavigation || !navigating)) { await request.abort(); return; }
            if (mainNavigation && navigationOrigin && requested.origin !== navigationOrigin) {
              throw new TranslationError("CROSS_ORIGIN_EXPLORATION", "Related-page exploration must stay on the same origin.");
            }
            if (["media", "websocket", "eventsource"].includes(request.resourceType())) { await request.abort(); return; }
            await validateRequest(request.url());
            if (!request.isInterceptResolutionHandled()) await request.continue();
          } catch (error) {
            if (mainNavigation && error instanceof TranslationError) navigationFailure = error;
            if (!request.isInterceptResolutionHandled()) await request.abort().catch(() => undefined);
          }
        };
        page.on("request", request => { void handleRequest(request).catch(() => undefined); });
        page.on("dialog", dialog => { void dialog.dismiss().catch(() => undefined); });
        // Page script cannot open a second browsing context or long-lived socket.
        await call(() => page.evaluateOnNewDocument(() => {
          (globalThis as unknown as { open: () => null }).open = () => null;
          Object.defineProperty(globalThis, "WebSocket", { value: class { constructor() { throw new Error("Sockets unavailable during public capture"); } } });
          Object.defineProperty(globalThis, "EventSource", { value: class { constructor() { throw new Error("Event streams unavailable during public capture"); } } });
        }), 5000, "BROWSER_SETUP_TIMEOUT", "The temporary browser did not finish setup in time.").catch(error => { throw browserError(error, "BROWSER_SETUP_FAILED", "The temporary browser could not be prepared."); });
        const navigate = async (target: URL, sameOrigin?: string) => {
          await action("navigating", "Loading an approved public source page.");
          await withinDeadline(validatePublicURL(target, resolveDNS, signal), signal);
          navigating = true; navigationOrigin = sameOrigin; navigationFailure = undefined;
          try {
            const response = await call(() => page.goto(target.href, { waitUntil: "domcontentloaded", timeout: Math.max(1, remaining(20_000)) }), 20_000, "SOURCE_TIMEOUT", "The source page did not finish loading in time.");
            if (navigationFailure) throw navigationFailure;
            const status = response?.status?.();
            if (status === 429) throw new TranslationError("SOURCE_RATE_LIMITED", "The source is temporarily rate limiting public access.", 429);
            if (status === 401 || status === 403) throw new TranslationError("SOURCE_BLOCKED", "The source requires sign-in or blocks public browser access.");
            if (!response || !response.ok()) throw new TranslationError("SOURCE_UNAVAILABLE", "The source did not return an accessible public page.", 502);
          } catch (error) {
            if (navigationFailure) throw navigationFailure;
            throw browserError(error, "SOURCE_NAVIGATION_FAILED", "The temporary browser could not load the source page.");
          } finally { navigating = false; }
          const actual = await withinDeadline(validatePublicURL(page.url(), resolveDNS, signal), signal);
          if (sameOrigin && actual.origin !== sameOrigin) throw new TranslationError("CROSS_ORIGIN_EXPLORATION", "Related-page exploration must stay on the same origin.");
        };
        await navigate(url);
        try {
          await call(() => page.waitForFunction(() => {
            const document = (globalThis as unknown as { document?: { body?: { innerText?: string } } }).document;
            return (document?.body?.innerText?.length ?? 0) > 80;
          }, { timeout: Math.max(1, remaining(4000)) }), 4000, "SOURCE_CONTENT_TIMEOUT", "The source did not expose readable content in time.");
        } catch { throwIfAborted(signal); /* Inspect the actual DOM even if the readiness heuristic times out. */ }
        let liveViewActive = true;
        try {
          await call(async () => {
            const session = await page.createCDPSession();
            if (!liveViewActive || signal.aborted) return;
            const live = await session.send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: 90_000 });
            if (liveViewActive && !signal.aborted && new URL(live.devtoolsFrontendUrl).protocol === "https:") await run.onProgress?.({ type: "liveView", url: live.devtoolsFrontendUrl });
          }, 3000, "LIVE_VIEW_TIMEOUT", "Live View was not available in time.");
        } catch {
          throwIfAborted(signal);
          await progress("liveViewUnavailable", "Live View is unavailable; continuing source inspection.");
        } finally { liveViewActive = false; }
        const inspect = async (): Promise<CaptureEvidence> => {
          await action("inspecting", "Reading the rendered source content and links.");
          const html = await call(() => page.content(), 10_000, "BROWSER_INSPECTION_TIMEOUT", "The browser did not return readable source content in time.").catch(error => { throw browserError(error, "BROWSER_INSPECTION_FAILED", "The browser could not return readable source content."); });
          const evidence = evidenceFromHTML(html, page.url(), run.deadlineAt);
          evidence.captureProfile = { id: "public-desktop-v1", viewport: { width: 1280, height: 900 } };
          if (evidence.text.length < 80 || isChallengeTitle(evidence.title)) throw new TranslationError("SOURCE_BLOCKED", "The source is blocked, requires sign-in, or has insufficient public content.");
          return evidence;
        };
        let primary = await inspect();
        if (options.explore && run.purpose !== "revalidate" && run.deadlineAt - Date.now() > 35_000) {
          await progress("planning", "Astra is selecting any additional source inspection.");
          const plan = await withinDeadline(options.explore(primary, signal), signal);
          const relatedPages: NonNullable<CaptureEvidence["relatedPages"]> = [];
          let opened = false;
          for (const step of plan) {
            if (step.kind === "scroll") {
              await action("scrolling", "Scrolling to inspect additional source content.");
              await call(() => page.evaluate(amount => (globalThis as unknown as { scrollBy(x: number, y: number): void }).scrollBy(0, amount), step.amount), 5000, "BROWSER_INSPECTION_TIMEOUT", "Additional source inspection did not finish in time.");
              const update = await inspect();
              if (!opened) primary = update;
            } else {
              if (opened) throw new TranslationError("PAGE_LIMIT", "Only one related page may be inspected.");
              const related = normalizePublicURL(step.url);
              if (related.origin !== new URL(primary.sourceURL).origin || !primary.links.some(link => link.url === related.href)) throw new TranslationError("UNSAFE_EXPLORATION", "Exploration target is not a same-origin source link.");
              opened = true;
              try {
                await navigate(related, new URL(primary.sourceURL).origin);
                const evidence = await inspect();
                relatedPages.push({ sourceURL: evidence.sourceURL, title: evidence.title, text: evidence.text.slice(0, 10_000) });
              } catch (error) {
                throwIfAborted(signal);
                if (!(error instanceof TranslationError) || !["SOURCE_UNAVAILABLE", "SOURCE_BLOCKED", "SOURCE_RATE_LIMITED"].includes(error.code)) throw error;
                await progress("relatedPageUnavailable", "The optional related page is unavailable; retaining the readable primary source.");
                break;
              }
            }
          }
          if (relatedPages.length) primary.relatedPages = relatedPages;
        }
        return primary;
      } catch (error) {
        captureFailed = true;
        throw error;
      } finally {
        signal.removeEventListener("abort", abort);
        const cleanup = close();
        // Start closure even after cancellation, but never wait past the overall deadline.
        void cleanup.catch(() => undefined);
        try {
          await bounded(() => cleanup, remaining(2000), new TranslationError("BROWSER_CLEANUP_FAILED", "Unable to confirm temporary browser closure within the capture deadline.", 502));
        } catch {
          // A source/security/cancellation error is more useful than a secondary cleanup error.
          if (!captureFailed) throw new TranslationError("BROWSER_CLEANUP_FAILED", "Unable to confirm temporary browser closure.", 502);
        }
        if (!captureFailed) await progress("captured", "Source capture is complete and the temporary browser is closed.");
      }
    },
  };
}
