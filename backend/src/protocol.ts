export const CATALOG_ID = "https://a2ui.org/specification/v0_9/basic_catalog.json";

export interface PageBundle {
  protocolVersion: 1;
  pageKey: string;
  sourceURL: string;
  title: string;
  capturedAt: string;
  specRevision: string;
  recipeRevision: string;
  contentRevision: string;
  spec: { catalogId: string; messages: Record<string, unknown>[] };
  recipe: Record<string, unknown>;
  content: Record<string, unknown>;
  generation: { model: string; generatedAt: string; promptVersion: string };
  captureProfile?: { id: string; viewport?: { width: number; height: number }; locale?: string };
}

export interface PageManifest {
  protocolVersion: 1;
  pageKey: string;
  bundleRevision: string;
  bundleURL: string;
  sourceURL: string;
  title: string;
  specRevision: string;
  recipeRevision: string;
  contentRevision: string;
  capturedAt: string;
  sourceCheckedAt: string;
}

export type CompileOutput = Pick<PageBundle, "title" | "spec" | "recipe" | "content" | "generation">;
export type ProgressEvent =
  | { type: "status"; stage: string; message: string }
  | { type: "liveView"; url: string };

export class APIError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "APIError";
    this.code = code;
    this.status = status;
  }
}

export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJSON(item)}`).join(",")}}`;
  }
  throw new APIError("INVALID_ARTIFACT", "Artifacts must contain JSON values only.");
}

export async function revisionOf(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJSON(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalSourceURL(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new APIError("INVALID_URL", "Enter a complete public HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || input.length > 8192) {
    throw new APIError("INVALID_URL", "Use a public HTTPS URL without credentials or a custom port.");
  }
  url.hash = "";
  return url.href;
}

export function pageKeyFor(sourceURL: string): Promise<string> {
  return revisionOf({ sourceURL: canonicalSourceURL(sourceURL), variant: "public-default-v1" });
}
