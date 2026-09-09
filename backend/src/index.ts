import { MemoryArtifactStore } from "./artifacts.ts";
import { APIError } from "./protocol.ts";
import { createRouter } from "./router.ts";
import { createApprovedCloudRouter, type CloudEnvironment } from "./cloud.ts";

export const assertCloudDisabled = (): never => {
  throw new APIError("CLOUD_APPROVAL_REQUIRED", "Cloud conversion is disabled pending approval of the Cloudflare configuration and gateway ID.", 503);
};

// Safe default: no binding is touched, including during local Wrangler development.
const local = createRouter({
  store: new MemoryArtifactStore(),
  mode: "cloud-disabled",
  assertExecutionAllowed: assertCloudDisabled,
  pipeline: { capture: async () => assertCloudDisabled(), compile: async () => assertCloudDisabled(), reextract: () => assertCloudDisabled() },
});

const approvedRouters = new WeakMap<object, ReturnType<typeof createApprovedCloudRouter>>();
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const cloud = env as Env & CloudEnvironment;
    if (cloud.CLOUD_EXECUTION_APPROVED !== "true") return local(request);
    let router = approvedRouters.get(env);
    if (!router) { router = createApprovedCloudRouter(cloud); approvedRouters.set(env, router); }
    return router(request);
  },
} satisfies ExportedHandler<Env>;
