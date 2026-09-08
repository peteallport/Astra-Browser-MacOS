/**
 * Infrastructure scaffold only. No source acquisition, model inference,
 * artifact publication, or content-update pipeline is implemented here.
 */
export default {
  fetch(request, env): Response {
    const url = new URL(request.url);

    if (url.pathname !== "/health") {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Only /health is implemented." } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json(
        { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET or HEAD." } },
        {
          status: 405,
          headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
        },
      );
    }

    const health = {
      service: "astrabrowse-backend",
      status: "infrastructure_scaffold",
      ready: false,
      features: {
        health: "implemented",
        sourceAcquisition: "not_implemented",
        astraCompilation: "not_implemented",
        artifactStorage: "not_implemented",
        contentUpdates: "not_implemented",
        resolveRateLimiting: "not_implemented",
      },
      configuration: {
        browserBindingPresent: env.BROWSER !== undefined,
        artifactBindingPresent: env.ARTIFACTS !== undefined,
        rateLimitBindingPresent: env.RESOLVE_RATE_LIMITER !== undefined,
        gatewayAccountPresent: env.CLOUDFLARE_ACCOUNT_ID.trim().length > 0,
        gatewayNamePresent: env.AI_GATEWAY_ID.trim().length > 0,
        credentials: "not_checked",
        remoteServices: "not_checked",
      },
    };

    // Binding/configuration presence is not proof of remote resource existence,
    // authorization, provider entitlement, or successful service connectivity.
    return new Response(request.method === "HEAD" ? null : JSON.stringify(health), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
} satisfies ExportedHandler<Env>;
