export type JSONValue = null | boolean | number | string | JSONValue[] | JSONObject;
export interface JSONObject { [key: string]: JSONValue }

export const CATALOG_ID = "https://a2ui.org/specification/v0_9/basic_catalog.json";
export const SURFACE_ID = "page";
export const PROMPT_VERSION = "astrabrowse-a2ui-v0.9-1";
export const MAX_RUN_MS = 90_000;
export type TranslationProgress =
  | { type: "status"; stage: string; message: string }
  | { type: "liveView"; url: string };
export type ProgressCallback = (event: TranslationProgress) => void | Promise<void>;
export interface RunOptions { signal?: AbortSignal; onProgress?: ProgressCallback; purpose?: "resolve" | "revalidate" }
export interface CaptureEvidence {
  sourceURL: string;
  title: string;
  capturedAt: string;
  html: string;
  text: string;
  links: { text: string; url: string }[];
  theme: { primaryColor?: string };
  captureProfile?: { id: string; viewport?: { width: number; height: number }; locale?: string };
  /** Internal wall-clock deadline; never publish it as source content. */
  deadlineAt: number;
  relatedPages?: { sourceURL: string; title: string; text: string }[];
}
export interface CaptureTransport {
  capture(url: URL, options: RunOptions & { deadlineAt: number }): Promise<CaptureEvidence>;
}
export interface ModelRequest {
  instructions: string;
  input: string;
  schema: JSONObject;
  maxOutputTokens: number;
  signal: AbortSignal;
}
export interface ModelTransport {
  generate(request: ModelRequest): Promise<{ value: unknown; model: string }>;
}
export interface CloudAccessGate { assertAllowed(operation: "browser" | "model" | "dns"): void }
/** Only construct an enabled gate after the user has explicitly approved cloud operations. */
export function createCloudAccessGate(approvedByUser = false): CloudAccessGate {
  return { assertAllowed(operation) {
    if (!approvedByUser) throw new TranslationError("CLOUD_APPROVAL_REQUIRED", `Cloud ${operation} access requires explicit user approval.`, 503);
  } };
}
export interface ExtractionField {
  key: string;
  selector: string;
  value: "text" | "href" | "src" | "alt" | "content";
  required: boolean;
}
export interface ExtractionRecipe {
  version: 1;
  fields: ExtractionField[];
  lists: { key: string; selector: string; keyAttribute: string | null; maxItems: number; fields: ExtractionField[] }[];
}
export interface A2UISpec { catalogId: string; messages: JSONObject[] }
export interface CompilationResult {
  spec: A2UISpec;
  recipe: ExtractionRecipe;
  content: JSONObject;
  title: string;
  generation: { model: string; generatedAt: string; promptVersion: string };
}
export class TranslationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message); this.name = "TranslationError"; this.code = code; this.status = status;
  }
}
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new TranslationError("CANCELLED", "Conversion was cancelled.", 499);
}
export function deadlineSignal(deadlineAt: number, signal?: AbortSignal): AbortSignal {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new TranslationError("DEADLINE_EXCEEDED", "The 90-second conversion limit was reached.", 504);
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(remaining)]) : AbortSignal.timeout(remaining);
}
export async function withinDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void work.catch(() => undefined); throwIfAborted(signal); }
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new TranslationError("DEADLINE_OR_CANCELLED", "Conversion stopped at its deadline or was cancelled.", 504));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try { return await Promise.race([work, cancelled]); }
  finally { if (abort) signal.removeEventListener("abort", abort); }
}
