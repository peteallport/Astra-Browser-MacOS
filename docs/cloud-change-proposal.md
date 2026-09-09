# Cloud activation record — approved and deployed

Peter approved the listed resources/configuration, production deployment, one bounded live conversion, and one revalidation at approximately 4:40 p.m. Pacific on September 8, 2026. This records the approved scope and observed results; the first model-route failure does not revoke that authorization or require the same approval again.

## Approved resources and observed state

| Resource or setting | Current state |
| --- | --- |
| Worker `astrabrowse-backend` | Deployed at [astrabrowse-backend.quirk.workers.dev](https://astrabrowse-backend.quirk.workers.dev). Latest version: `10874f03-669f-4b59-9e2b-dc448bda805f`. |
| Private R2 bucket `astrabrowse-artifacts` | R2 enabled and bucket created; bound as `ARTIFACTS`. The earlier activation error is resolved. |
| AI Gateway `astrabrowse-demo-gateway` | Existing gateway reused; its identity and configured OpenAI BYOK key were verified in the dashboard. No credential value was copied into source or the client. |
| Workers AI binding `AI` | Added to the approved `production` environment for automatic gateway authentication. |
| Browser Run binding `BROWSER` | Configured; the first live capture of the hosted finance source succeeded. Sessions are temporary and created on demand. |
| Rate limiter `RESOLVE_RATE_LIMITER` | Configured with namespace `2026090801`, limit 10 requests per 60 seconds. This is not a global spending cap. |
| `AI_GATEWAY_ID` | Set to `astrabrowse-demo-gateway`. |
| `AI_GATEWAY_BYOK_ALIAS` | Set to verified alias `openai-astrabrowse-demo`; both tested header placements still resulted in a gateway request for `default`. |
| `CLOUD_EXECUTION_APPROVED` | `false` in top-level local settings; `true` in `production`. |
| Deployment commands | `npm run deploy` and `npm run deploy:dry-run` select `--env production`; the dry run does not deploy. |

No Durable Object, queue, KV namespace, D1 database, cron trigger, new provider credential, public R2 endpoint, custom domain, or authenticated-source session was included in this resource list.

## Live integration result

**Verified:** hosted shared-cache resolution returned finance and Hacker News bundles with validated `gpt-6-astra` provenance, complete artifact structure, and matching manifest hashes. These generated artifacts exist independently of the labeled local fixture.

**Failed checks:** the unfamiliar IANA cold request returned `CONVERSION_FAILED` after capture-stage events and before Live View, so it did not establish current model credential usability. Finance revalidation returned HTTP 200, advanced `sourceCheckedAt`, and passed bundle/spec/recipe/generation checks, but `changed: false` and unchanged content failed the expected-change assertion. A live changing-content demonstration is not verified.

The initial unified route returned `7003`; earlier provider-native alias attempts returned `2040`. Peter later reported a duplicate `default` secret after removing its visible gateway entry; its underlying secret still exists. No secrets were deleted. Preserve existing credentials and distinguish old artifact availability from current provider access. No credential values were inspected in this documentation task. See [verification evidence](local-verification.md).

## Continuing within the approved scope

The approved bounded checks were attempted and their partial results are recorded above. Further debugging must preserve existing resources, credentials, and useful cached artifacts. Streaming conversion has a 90-second deadline and depends on a connected client. Duplicate suppression is per Worker isolate; conditional R2 publication rejects a writer whose starting manifest changed but does not provide globally unique jobs or a transaction across both objects.

Keep default local development cloud-disabled. The listed resources/configuration and bounded checks were approved, and Peter subsequently authorized committing and pushing all current work. Additional resources, secrets, schedules, or broader remote operations beyond that scope require separate confirmation. Repository visibility and hackathon submission are separate actions. This documentation update made no cloud calls, credential changes, or secret deletions.
