# AstraBrowse backend

The Worker implements streaming URL resolution, immutable A2UI bundles, conditional manifests, and source revalidation at [astrabrowse-backend.quirk.workers.dev](https://astrabrowse-backend.quirk.workers.dev). **Finance/HN shared-cache checks pass, and a fresh Wikipedia conversion completed in 42.7 seconds, passed artifact validation, and rendered in the native app.** Current Astra access is verified by that run; intermittent stream failures and the earlier finance expected-change assertion remain under investigation. Local development stays cloud-disabled.

Read the [shared protocol](../docs/protocol.md), [planning source of truth](../planning.md), and [approved cloud activation record](../docs/cloud-change-proposal.md) before changing configuration.

## Local development

Use Node.js 24 or newer for the built-in TypeScript test and fixture commands. From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run deploy:dry-run
npm run dev
```

`npm run dev` starts Wrangler with local bindings. With the checked-in configuration, `/health` and `/demo/finance` work and `/resolve` emits `CLOUD_APPROVAL_REQUIRED`. No binding is read or invoked by the default router. Do not enable remote bindings to run local tests.

To exercise the native client’s real HTTP contract without any external service, use this command instead of `npm run dev`:

```sh
npm run dev:fixture
```

It binds only `127.0.0.1:8787`; set `LOCAL_FIXTURE_PORT` to select another port. Set the native app backend to `http://localhost:8787` and resolve a valid HTTPS URL. The response prominently identifies itself as **LOCAL TEST FIXTURE**, with hand-authored layout and synthetic finance content. It is not an Astra conversion or a recorded live result. The fixture serves the same bundle, ETag, and revalidation protocol as the Worker, with no cloud or source network access. Stop one server before starting the other on the same port.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Wrangler server; external execution disabled by default |
| `npm run dev:fixture` | Local protocol fixture for native integration |
| `npm run typecheck` | TypeScript verification |
| `npm test` | Local router, publication, extraction, compiler, policy, and injected transport tests |
| `npm run deploy:dry-run` | Bundle the `production` environment locally into ignored `dist/`; no deployment |
| `npm run types` | Regenerate types after an approved configuration change |
| `npm run deploy` | Deploy the approved `production` environment |

Wrangler may need local filesystem and loopback-listener permission. A writable `WRANGLER_LOG_PATH` avoids its default user log directory. Generated binding types reflect the current declarations only; they do not verify hosted resources. Inspect generated types before committing them, and never include credentials.

## Implemented contract

| Endpoint | Behavior |
| --- | --- |
| `GET /health`, `HEAD /health` | Implemented features, execution mode, and explicitly unverified cloud readiness |
| `POST /resolve` | `{url}` request; SSE `status`, transient `liveView`, and terminal `ready` or `error` |
| `GET /pages/:key/manifest` | Current manifest with ETag and conditional 304 |
| `POST /pages/:key/revalidate` | JSON `{manifest,changed}`; recent source checks reuse the prior result |
| `GET /artifacts/:revision` | Validated immutable bundle with content-based identity |
| `GET /demo/finance` | Public source HTML with clearly labeled simulated quotes changing every 30 seconds |

Resolution has a 90-second total deadline. Concurrent requests for the same page share work within one Worker isolate; cancelling the last subscriber aborts that work. A complete validated bundle is persisted before a conditional manifest write makes it discoverable. A failed conversion or refresh preserves the prior valid manifest.

Source revalidation defaults to 60 seconds. It reuses the stored extraction recipe, skips the Astra exploration planner, and makes no model call while that recipe remains compatible. A required-field/list mismatch or invalid selector triggers a bounded repair compilation from the new capture. An unchanged content hash advances `sourceCheckedAt` while preserving the bundle revision. Native clients poll manifests every 15 seconds and decide when to apply pending content.

## Cloud adapter and activation gate

The production environment includes the Worker’s automatically authenticated `AI` binding. Latest deployment `10874f03-669f-4b59-9e2b-dc448bda805f` uses the provider-native Responses envelope and outer alias header:

```ts
env.AI.gateway("astrabrowse-demo-gateway").run({
  provider: "openai",
  endpoint: "responses",
  headers: { "Content-Type": "application/json" },
  query: { model: "gpt-6-astra", ...responsesInput },
}, {
  gateway: { skipCache: true, retries: { maxAttempts: 1 } },
  extraHeaders: { "cf-aig-byok-alias": "openai-astrabrowse-demo" },
  signal,
});
```

Earlier unified routing failed with HTTP 404 / code `7003`, followed by provider-native gateway `2040` responses requesting `default`. Generated finance/HN artifacts subsequently passed shared-cache validation. Peter reported a duplicate `default` secret after removing its visible gateway entry; the underlying secret still exists, and no secrets were deleted. The latest IANA cold request failed with `CONVERSION_FAILED` before Live View, so current credential usability is not established. Do not delete or replace secrets based on the duplicate error. No key value belongs in the app, repository, or verification output.

The approved `production` environment has `AI`, `BROWSER`, private R2 `ARTIFACTS` bound to `astrabrowse-artifacts`, and `RESOLVE_RATE_LIMITER` using namespace `2026090801` at 10 requests per 60 seconds. Its gateway ID is `astrabrowse-demo-gateway`; the verified nonsecret BYOK alias is `openai-astrabrowse-demo`. The bucket has been created and the Worker deployed. The top-level local environment has `CLOUD_EXECUTION_APPROVED=false`; production sets it to `true`. The previous account/auth-mode/model placeholders were removed, and the BYOK alias now has an explicit purpose in provider-native routing.

The earlier R2 activation error is resolved: Peter enabled R2, approved the listed cloud changes, and the private artifact bucket was created. Latest deployment version: `10874f03-669f-4b59-9e2b-dc448bda805f`. Resource creation and successful browser capture do not establish successful model generation or artifact publication.

Only `CLOUD_EXECUTION_APPROVED=true` selects the cloud router. Every R2 operation and browser/model/DNS transport checks this runtime gate. Peter's September 8 approval covers the listed resources/configuration, deployment, one bounded live conversion, and one revalidation. Keep that existing approval distinct from additional resource changes or operations beyond its scope, which require confirmation. See the [activation record](../docs/cloud-change-proposal.md).

See Cloudflare’s [AI binding guidance](https://developers.cloudflare.com/ai-gateway/usage/providers/workersai/), [BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/), [Browser Run configuration](https://developers.cloudflare.com/browser-run/reference/wrangler/), and [rate-limit binding documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Current limits and evidence

The local suite covers publication, immutable identity, ETags, coalescing, cancellation, freshness, repair, URL policy, extraction, and injected model behavior. Typecheck, 25 tests, and production dry-run bundling pass. Hosted finance/HN cache results validate model provenance and artifact hashes. Finance revalidation passed HTTP/schema/spec/recipe/generation checks and advanced `sourceCheckedAt`, but returned `changed: false` with unchanged content; the expected-change assertion failed. Its local state file remains at the prior `00:18:52Z` checkpoint because the checker stopped before saving. See the [verification record](../docs/local-verification.md).

There is no durable job queue or global single-compilation guarantee. Streaming work depends on an active client connection. Rate limits are approximate and local to a Cloudflare location; the configured 10 requests per 60 seconds is not a global spending cap. R2 conditional writes prevent a stale publisher replacing a newer manifest, even when separate isolates duplicate work.

Only public HTTPS pages are supported. The acquisition adapter checks URL/redirect/request destinations and public DNS results; it does not claim complete DNS-rebinding protection without pinned egress. No private sessions, authentication, forms, payment actions, or access-control bypass are supported. Live View URLs are ephemeral progress events and are never published in bundles or manifests. Layout rendering uses the constrained A2UI catalog understood by the native client.

Runtime dependencies are pinned `@cloudflare/puppeteer` and `linkedom`. The Puppeteer dependency tree currently reports `extract-zip` archive-extraction advisories; the Worker uses the remote Browser Run transport and does not invoke browser download/archive extraction APIs. This does not clear the dependency advisory. The `sharp` development override remains pinned to `0.35.4` for its earlier advisory; dependency changes should be reviewed rather than applying automatic major downgrades.
