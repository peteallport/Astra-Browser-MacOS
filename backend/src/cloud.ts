import { R2ArtifactStore } from "./artifacts.ts";
import { APIError } from "./protocol.ts";
import { createRouter } from "./router.ts";
import { createAstraExplorationPlanner, createAstraModelTransport, createBrowserCaptureTransport, createCloudAccessGate, createTranslationPipeline, validateRecipe, type AstraBinding, type BrowserBinding } from "./translation/index.ts";

/** Optional deployment fields are intentionally separate from generated config types. */
export interface CloudEnvironment {
  CLOUD_EXECUTION_APPROVED?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_BYOK_ALIAS?: string;
  AI?: AstraBinding;
  BROWSER?: BrowserBinding;
  ARTIFACTS?: R2Bucket;
  RESOLVE_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export function createApprovedCloudRouter(env: CloudEnvironment) {
  const assertApproved = (): void => {
    if (env.CLOUD_EXECUTION_APPROVED !== "true") throw new APIError("CLOUD_APPROVAL_REQUIRED", "Cloud operations require explicit approval.", 503);
    if (!env.AI || !env.BROWSER || !env.ARTIFACTS || !env.AI_GATEWAY_ID?.trim()) throw new APIError("CLOUD_NOT_CONFIGURED", "The approved AI, Browser Run, R2, and gateway configuration is incomplete.", 503);
  };
  const gate = createCloudAccessGate(env.CLOUD_EXECUTION_APPROVED === "true");
  const model = createAstraModelTransport(env.AI, { gatewayID: env.AI_GATEWAY_ID ?? "", byokAlias: env.AI_GATEWAY_BYOK_ALIAS, gate });
  const capture = createBrowserCaptureTransport(env.BROWSER, { gate, explore: createAstraExplorationPlanner(model) });
  const translation = createTranslationPipeline({ captureTransport: capture, modelTransport: model });
  const store = new R2ArtifactStore(env.ARTIFACTS as R2Bucket, assertApproved);
  const router = createRouter({
    store, mode: "cloud-approved", assertExecutionAllowed: assertApproved,
    pipeline: {
      capture: (url, options) => translation.capture(url, options),
      async compile(evidence, options) {
        const output = await translation.compile(evidence, options);
        return { ...output, recipe: { ...output.recipe } };
      },
      reextract(evidence, recipe) { return translation.reextract(evidence, validateRecipe(recipe)); },
    },
  });
  return async (request: Request): Promise<Response> => {
    if (request.method === "POST" && (new URL(request.url).pathname === "/resolve" || new URL(request.url).pathname.endsWith("/revalidate")) && env.RESOLVE_RATE_LIMITER) {
      try { assertApproved(); } catch { return new Response(JSON.stringify({ error: { code: "CLOUD_NOT_CONFIGURED", message: "Approved cloud configuration is incomplete." } }), { status: 503, headers: { "content-type": "application/json" } }); }
      const result = await env.RESOLVE_RATE_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" });
      if (!result.success) return new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Try again in a minute." } }), { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } });
    }
    return router(request);
  };
}
