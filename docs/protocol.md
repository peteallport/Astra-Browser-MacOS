# AstraBrowse protocol v1

Shared contract for the native, API, and translation implementation lanes. Use your configured backend origin; `https://backend.example.com` is a reserved documentation example. Cloud operations require the deployment operator's authorization; this contract does not grant it.

## Wire envelope

All dates are ISO 8601 strings. JSON object keys use the spelling below. Unknown extra metadata can be ignored. Bundle URLs may be relative to the API origin.

```ts
interface PageBundle {
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
interface PageManifest {
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
```

The pinned A2UI-Swift catalog ID is `https://a2ui.org/specification/v0_9/basic_catalog.json`, version `v0.9`. Each tab owns an isolated surface model. The serialized surface ID is `page`, and the root component ID is `root`. `spec.messages` contains `createSurface` then `updateComponents`; source content is not baked into the component specification. The native client injects `updateDataModel` at path `/content` with the bundle's content. Bindings use `{ "path": "/content/title" }` and equivalent A2UI collection-relative paths.

Navigation uses a constrained Button event `openURL` with URL in event context. Native navigation validates the final HTTP(S) URL. Follow the pinned library schema for remaining component props and action formatting; do not mix in json-render expressions.

## HTTP

- `POST /resolve`, body `{ "url": "https://..." }`, returns SSE. A shared hit emits ready immediately. No arbitrary client headers/cookies are accepted for source acquisition.
- `POST /pages/{pageKey}/revalidate` returns `{ "manifest": PageManifest, "changed": boolean }` after connected source revalidation. It preserves the existing specification and recipe when extraction succeeds. Recent shared checks can be reused.
- `GET /pages/{pageKey}/manifest` returns a manifest directly, with ETag/304 support.
- `GET /artifacts/{revision}` returns a PageBundle directly, immutable.
- `GET /demo/finance` is a clearly labeled synthetic source webpage, not an already converted native artifact.
- `GET /health` reports implemented capabilities separately from verified cloud readiness.

SSE events, each with JSON data followed by a blank line:

| Event | Data |
| --- | --- |
| `status` | `{ "stage": "capturing", "message": "Loading the source page" }` |
| `liveView` | `{ "url": "short-lived signed viewer URL" }` |
| `ready` | `{ "manifest": PageManifest }` |
| `error` | `{ "code": "CLOUD_APPROVAL_REQUIRED", "message": "..." }` |

Exactly one terminal ready/error is emitted if the stream remains connected. Owner cancellation aborts acquisition and initiates temporary-session closure; followers receive an explicit terminal cancellation error. Cancelling only a follower leaves its owner running. Closure after a hard cancellation or late launch remains best effort once the owning invocation ends. Live View URLs must never enter manifests, artifacts, persistent caches, or logs.

Publish the complete immutable bundle before its manifest. Hash source content independently of acquisition/check timestamps; unchanged content cannot create a content badge. Use conditional manifest publication to reject stale writers. On any invalid/missing artifact, retain the previous complete local revision.

## Local verification and cloud gate

Use injected local memory storage and test adapters for HTTP tests; label fixtures as fixtures and keep default local execution cloud-disabled. Configure your own account/resources through the [backend setup guide](../backend/README.md). The tracked Wrangler template supports local development and dry-run packaging; account-specific deployment values belong only in the ignored private configuration. Production adapters enforce their runtime gate. See the [configuration boundary](cloud-change-proposal.md) and [historical verification results](local-verification.md). Neither a protocol contract nor past demo evidence authorizes new resources, billing changes, credentials, deployment, or publication.
