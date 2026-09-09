import { type ArtifactStore, publishBundle } from "./artifacts.ts";
import { APIError, canonicalJSON, canonicalSourceURL, pageKeyFor, revisionOf, type CompileOutput, type PageBundle, type PageManifest, type ProgressEvent } from "./protocol.ts";
import { createBundle, validateBundle } from "./validation.ts";
import { renderFinancePage } from "./demo/finance.ts";
import { TranslationError } from "./translation/types.ts";
import { isChallengeTitle } from "./translation/challenge.ts";

export interface Evidence { sourceURL: string; capturedAt: string; captureProfile?: PageBundle["captureProfile"] }
export interface Pipeline<E extends Evidence = Evidence> {
  capture(url: string, options: { signal: AbortSignal; onProgress: (event: ProgressEvent) => void; purpose?: "resolve" | "revalidate" }): Promise<E>;
  compile(evidence: E, options: { signal: AbortSignal; onProgress: (event: ProgressEvent) => void }): Promise<CompileOutput>;
  reextract(evidence: E, recipe: Record<string, unknown>): Record<string, unknown>;
}
export interface RouterOptions<E extends Evidence = Evidence> {
  store: ArtifactStore;
  pipeline: Pipeline<E>;
  now?: () => number;
  deadlineMS?: number;
  sourceRefreshMS?: number;
  mode?: "cloud-approved" | "cloud-disabled" | "local-test-fixture";
  /** A gate is checked before acquisition, compilation, or a source check. */
  assertExecutionAllowed: () => void;
}
type Ready = { manifest: PageManifest; bundle?: PageBundle };
type PublicError = { code: string; message: string; status: number };
// Only plain data crosses Worker invocations. Promises, timers, abort controllers,
// and stream callbacks must remain owned by the request that created them.
type Job<T> = {
  outcome: { state: "running" } | { state: "ready"; value: T } | { state: "failed"; error: PublicError };
  events: { sequence: number; event: ProgressEvent }[];
  sequence: number;
  expiresAt: number;
};
const encoder = new TextEncoder();
const json = (value: unknown, status = 200, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
function publicError(error: unknown): PublicError {
  if (error instanceof APIError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof TranslationError) {
    const status = error.status >= 400 && error.status <= 599 ? error.status : 502;
    return { code: error.code, message: error.message, status };
  }
  return error instanceof Error && error.name === "AbortError" ? { code: "CANCELLED", message: "Conversion was cancelled.", status: 499 } : { code: "CONVERSION_FAILED", message: "The source could not be converted. The last valid page remains available.", status: 502 };
}

function rejectChallengeTitle(title: string): void {
  if (isChallengeTitle(title)) throw new APIError("SOURCE_BLOCKED", "The source returned a browser verification page. Open the original website or resolve the source again later.", 422);
}

async function readResolveBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > 10_000) { await reader.cancel(); throw new APIError("INVALID_REQUEST", "The resolve request is too large.", 413); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

export function createRouter<E extends Evidence>(options: RouterOptions<E>): (request: Request) => Promise<Response> {
  const { store, pipeline } = options;
  const now = options.now ?? Date.now;
  const jobs = new Map<string, Job<unknown>>();
  const recent = new Map<string, { count: number; expires: number }>();

  const deadlineError = (): APIError => new APIError("DEADLINE_EXCEEDED", "Conversion exceeded its deadline. Try again or open the original page.", 504);
  const cancelledError = (): DOMException => new DOMException("Cancelled", "AbortError");

  function pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(cancelledError()); return; }
      const finish = (): void => { signal.removeEventListener("abort", cancel); resolve(); };
      const timer = setTimeout(finish, ms);
      const cancel = (): void => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(cancelledError()); };
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  async function followJob<T>(job: Job<T>, signal: AbortSignal, listener: (event: ProgressEvent) => void): Promise<T> {
    let sequence = 0;
    while (true) {
      if (signal.aborted) throw cancelledError();
      for (const item of job.events) {
        if (item.sequence > sequence) { listener(item.event); sequence = item.sequence; }
      }
      if (job.outcome.state === "ready") return job.outcome.value;
      if (job.outcome.state === "failed") {
        const { code, message, status } = job.outcome.error;
        throw new APIError(code, message, status);
      }
      const remaining = job.expiresAt - Date.now();
      if (remaining <= 0) throw deadlineError();
      // A timer in this invocation keeps its deadline independent of the owner.
      await pause(Math.min(100, remaining), signal);
    }
  }

  async function joinJob<T>(key: string, signal: AbortSignal, listener: (event: ProgressEvent) => void, work: (signal: AbortSignal, progress: (event: ProgressEvent) => void) => Promise<T>): Promise<T> {
    if (signal.aborted) throw cancelledError();
    const existing = jobs.get(key) as Job<T> | undefined;
    if (existing && existing.expiresAt > Date.now()) return followJob(existing, signal, listener);
    // A killed owner might never execute finally. Expired plain records are safe
    // to replace; followers retain their own deadline even if that happens.
    for (const [id, record] of jobs) if (record.expiresAt <= Date.now()) jobs.delete(id);
    const job: Job<T> = { outcome: { state: "running" }, events: [], sequence: 0, expiresAt: Date.now() + (options.deadlineMS ?? 90_000) };
    jobs.set(key, job);
    const abort = new AbortController();
    const retireLiveView = (): void => { job.events = job.events.filter(item => item.event.type !== "liveView"); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel = (): void => {};
    const stopped = new Promise<never>((_, reject) => {
      cancel = (): void => {
        retireLiveView();
        job.outcome = { state: "failed", error: { code: "SHARED_CONVERSION_CANCELLED", message: "The request running this shared conversion was cancelled. Try again or open the original page.", status: 409 } };
        reject(cancelledError());
        abort.abort();
      };
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        const error = deadlineError();
        retireLiveView();
        job.outcome = { state: "failed", error: publicError(error) };
        reject(error);
        abort.abort(error);
      }, Math.max(0, job.expiresAt - Date.now()));
    });
    const emit = (event: ProgressEvent): void => {
      if (job.outcome.state !== "running") return;
      if (event.type === "status" && ["captured", "compile", "compiling", "validate"].includes(event.stage)) retireLiveView();
      job.events.push({ sequence: ++job.sequence, event: structuredClone(event) });
      if (job.events.length > 32) job.events.shift();
      listener(event);
    };
    try {
      // The work and its I/O never leave this invocation's promise chain.
      const value = await Promise.race([Promise.resolve().then(() => {
        abort.signal.throwIfAborted();
        return work(abort.signal, emit);
      }), stopped]);
      retireLiveView();
      job.outcome = { state: "ready", value };
      return value;
    } catch (error) {
      retireLiveView();
      if (job.outcome.state === "running") job.outcome = { state: "failed", error: publicError(error) };
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (jobs.get(key) === job) jobs.delete(key);
    }
  }

  async function resolveSource(sourceURL: string, signal: AbortSignal, progress: (event: ProgressEvent) => void): Promise<Ready> {
    const pageKey = await pageKeyFor(sourceURL);
    return joinJob(`resolve:${pageKey}`, signal, progress, async (jobSignal, emit) => {
      const existing = await store.getManifest(pageKey);
      if (existing && !isChallengeTitle(existing.manifest.title)) {
        const bundle = await store.getBundle(existing.manifest.bundleRevision);
        if (bundle && !isChallengeTitle(bundle.title)) {
          await validateBundle(bundle);
          if (bundle.pageKey !== pageKey || await revisionOf(bundle) !== existing.manifest.bundleRevision) throw new APIError("INVALID_ARTIFACT", "The stored bundle does not match its manifest.", 502);
          emit({ type: "status", stage: "cache", message: "Loaded a validated shared snapshot." }); return { manifest: existing.manifest, bundle };
        }
      }
      options.assertExecutionAllowed();
      emit({ type: "status", stage: "capture", message: "Reading the public source." });
      const evidence = await pipeline.capture(sourceURL, { signal: jobSignal, onProgress: emit, purpose: "resolve" });
      jobSignal.throwIfAborted();
      emit({ type: "status", stage: "compile", message: "Preparing the native page." });
      const output = await pipeline.compile(evidence, { signal: jobSignal, onProgress: emit });
      jobSignal.throwIfAborted();
      rejectChallengeTitle(output.title);
      const bundle = await createBundle(pageKey, sourceURL, evidence.capturedAt, output);
      if (evidence.captureProfile) bundle.captureProfile = evidence.captureProfile;
      jobSignal.throwIfAborted();
      emit({ type: "status", stage: "validate", message: "Validated the native layout and source content." });
      const result = await publishBundle(store, bundle, new Date(now()).toISOString(), existing?.etag ?? null, jobSignal);
      return result.published ? { manifest: result.manifest, bundle } : { manifest: result.manifest };
    });
  }

  async function revalidate(key: string, signal: AbortSignal): Promise<{ manifest: PageManifest; changed: boolean }> {
    return joinJob(`refresh:${key}`, signal, () => {}, async (jobSignal, emit) => {
      const existing = await store.getManifest(key);
      if (!existing) throw new APIError("NOT_FOUND", "No compiled page exists for this key.", 404);
      rejectChallengeTitle(existing.manifest.title);
      if (now() - Date.parse(existing.manifest.sourceCheckedAt) < (options.sourceRefreshMS ?? 60_000)) return { manifest: existing.manifest, changed: false };
      options.assertExecutionAllowed();
      const previous = await store.getBundle(existing.manifest.bundleRevision);
      if (!previous) throw new APIError("ARTIFACT_MISSING", "The compiled artifact is unavailable. Resolve the source again.", 503);
      await validateBundle(previous);
      if (previous.pageKey !== key || await revisionOf(previous) !== existing.manifest.bundleRevision) throw new APIError("INVALID_ARTIFACT", "The stored bundle does not match its manifest.", 502);
      const evidence = await pipeline.capture(previous.sourceURL, { signal: jobSignal, onProgress: emit, purpose: "revalidate" });
      jobSignal.throwIfAborted();
      let content: Record<string, unknown>;
      try { content = pipeline.reextract(evidence, previous.recipe); }
      catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (code !== "RECIPE_DRIFT" && code !== "INVALID_SELECTOR") throw error;
        emit({ type: "status", stage: "repair", message: "The source structure changed. Rebuilding its extraction recipe." });
        const output = await pipeline.compile(evidence, { signal: jobSignal, onProgress: emit });
        jobSignal.throwIfAborted();
        rejectChallengeTitle(output.title);
        const repaired = await createBundle(key, previous.sourceURL, evidence.capturedAt, output);
        if (evidence.captureProfile) repaired.captureProfile = evidence.captureProfile;
        jobSignal.throwIfAborted();
        const result = await publishBundle(store, repaired, new Date(now()).toISOString(), existing.etag, jobSignal);
        return { manifest: result.manifest, changed: result.manifest.bundleRevision !== existing.manifest.bundleRevision };
      }
      const checkedAt = new Date(now()).toISOString();
      if (await revisionOf(content) === previous.contentRevision) {
        const manifest = { ...existing.manifest, sourceCheckedAt: checkedAt };
        jobSignal.throwIfAborted();
        if (await store.putManifest(key, manifest, existing.etag)) return { manifest, changed: false };
        const winner = await store.getManifest(key);
        if (!winner) throw new APIError("PUBLICATION_CONFLICT", "The manifest changed during refresh. Retry.", 409);
        return { manifest: winner.manifest, changed: winner.manifest.contentRevision !== previous.contentRevision };
      }
      const bundle = await createBundle(key, previous.sourceURL, evidence.capturedAt, { title: previous.title, spec: previous.spec, recipe: previous.recipe, content, generation: previous.generation });
      if (evidence.captureProfile ?? previous.captureProfile) bundle.captureProfile = evidence.captureProfile ?? previous.captureProfile!;
      jobSignal.throwIfAborted();
      const result = await publishBundle(store, bundle, checkedAt, existing.etag, jobSignal);
      return { manifest: result.manifest, changed: result.manifest.contentRevision !== previous.contentRevision };
    });
  }

  function resolveStream(request: Request, sourceURL: string): Response {
    const cancellation = new AbortController();
    const requestID = crypto.randomUUID();
    const startedAt = Date.now();
    let stage = "connected";
    let open = true;
    let terminal = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const diagnostic = (outcome: string, code?: string, exceptionKind?: string): void => {
      if (options.mode !== "cloud-approved") return;
      // Deliberately omit source URLs, input, provider bodies, and Live View tokens.
      console.info(JSON.stringify({ event: "resolve_stream", requestID, outcome, stage, elapsedMS: Date.now() - startedAt, ...(code ? { code } : {}), ...(exceptionKind ? { exceptionKind } : {}) }));
    };
    const abort = (): void => { cancellation.abort(); };
    const dispose = (): void => {
      if (heartbeat !== undefined) { clearInterval(heartbeat); heartbeat = undefined; }
      request.signal.removeEventListener("abort", abort);
    };
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) cancellation.abort();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (text: string): boolean => {
          if (!open) return false;
          try { controller.enqueue(encoder.encode(text)); return true; }
          catch {
            open = false;
            dispose();
            cancellation.abort();
            diagnostic("transport_closed");
            return false;
          }
        };
        const send = (event: string, data: unknown): void => {
          if (!open || terminal) return;
          if (event === "ready" || event === "error") terminal = true;
          write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        // Flush headers before cache lookup, browser launch, or joining an owner.
        send("status", { stage, message: "Connected to the conversion service.", requestID });
        diagnostic("started");
        heartbeat = setInterval(() => { if (!terminal) write(": keepalive\n\n"); }, 15_000);
        const run = async (): Promise<void> => {
          try {
            const result = await resolveSource(sourceURL, cancellation.signal, event => {
              const { type, ...data } = event;
              if (type === "status") { stage = event.stage; diagnostic("progress"); }
              send(type, data);
            });
            send("ready", result);
            diagnostic("ready");
          } catch (error) {
            const { code, message } = publicError(error);
            // A request abort can occur while its response reader remains open.
            // Emit its terminal error when possible; reader.cancel() closes writes.
            send("error", { code, message, requestID, stage });
            const exceptionKind = error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError" : error instanceof SyntaxError ? "SyntaxError" : error instanceof Error ? "Error" : "non_error";
            diagnostic("error", code, exceptionKind);
          } finally {
            dispose();
            if (open) { open = false; try { controller.close(); } catch { /* Transport already closed. */ } }
          }
        };
        // run handles all conversion failures; no rejected floating .finally chain.
        void run();
      },
      cancel() {
        open = false;
        dispose();
        cancellation.abort();
        diagnostic("consumer_cancelled");
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no", "x-astrabrowse-request-id": requestID } });
  }

  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health" && ["GET", "HEAD"].includes(request.method)) {
        const response = json({ service: "astrabrowse-backend", status: "implementation_in_progress", ready: false, mode: options.mode ?? "cloud-disabled", cloudVerified: false, features: { artifactAPI: "implemented", sourceRevalidation: "implemented", sseConversion: "implemented", cloudExecution: options.mode === "cloud-approved" ? "enabled_unverified" : "disabled_pending_approval" } });
        return request.method === "HEAD" ? new Response(null, response) : response;
      }
      if (url.pathname === "/demo/finance" && request.method === "GET") return new Response(renderFinancePage(now()), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      if (request.method === "POST" && (url.pathname === "/resolve" || /^\/pages\/[a-f0-9]{64}\/revalidate$/.test(url.pathname))) {
        const key = request.headers.get("cf-connecting-ip") ?? "local";
        const entry = recent.get(key);
        const limit = entry && entry.expires > now() ? entry : { count: 0, expires: now() + 60_000 };
        if (++limit.count > 10) throw new APIError("RATE_LIMITED", "Too many conversion requests. Try again in a minute.", 429);
        recent.set(key, limit);
        if (recent.size > 1024) for (const [id, value] of recent) if (value.expires <= now()) recent.delete(id);
        if (recent.size > 2048) recent.delete(recent.keys().next().value!);
      }
      if (url.pathname === "/resolve" && request.method === "POST") {
        const body = await readResolveBody(request);
        let input: unknown;
        try { input = JSON.parse(body); } catch { throw new APIError("INVALID_REQUEST", "Provide JSON with a public source URL."); }
        if (!input || typeof input !== "object" || !("url" in input) || typeof input.url !== "string") throw new APIError("INVALID_REQUEST", "Provide a public source URL.");
        return resolveStream(request, canonicalSourceURL(input.url));
      }
      const manifestMatch = url.pathname.match(/^\/pages\/([a-f0-9]{64})\/manifest$/);
      if (manifestMatch && request.method === "GET") {
        const stored = await store.getManifest(manifestMatch[1]!);
        if (!stored) throw new APIError("NOT_FOUND", "Page manifest not found.", 404);
        rejectChallengeTitle(stored.manifest.title);
        const etag = `"${await revisionOf(stored.manifest)}"`;
        if (request.headers.get("if-none-match")?.split(",").map(value => value.trim()).includes(etag)) return new Response(null, { status: 304, headers: { etag, "cache-control": "no-cache" } });
        return json(stored.manifest, 200, { etag, "cache-control": "no-cache" });
      }
      const refreshMatch = url.pathname.match(/^\/pages\/([a-f0-9]{64})\/revalidate$/);
      if (refreshMatch && request.method === "POST") return json(await revalidate(refreshMatch[1]!, request.signal));
      const artifactMatch = url.pathname.match(/^\/artifacts\/([a-f0-9]{64})$/);
      if (artifactMatch && request.method === "GET") {
        const bundle = await store.getBundle(artifactMatch[1]!);
        if (!bundle) throw new APIError("NOT_FOUND", "Artifact not found.", 404);
        rejectChallengeTitle(bundle.title);
        await validateBundle(bundle);
        if (await revisionOf(bundle) !== artifactMatch[1]) throw new APIError("INVALID_ARTIFACT", "Artifact identity does not match its contents.", 502);
        return new Response(canonicalJSON(bundle), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", etag: `"${artifactMatch[1]}"` } });
      }
      throw new APIError("NOT_FOUND", "Endpoint not found.", 404);
    } catch (error) { const { code, message, status } = publicError(error); return json({ error: { code, message } }, status); }
  };
}
