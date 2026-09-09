# Cloud activation record — approved and deployed

Peter approved the listed resources/configuration, production deployment, one bounded live conversion, and one revalidation at approximately 4:40 p.m. Pacific on September 8, 2026. This records the approved scope and observed results; the first model-route failure does not revoke that authorization or require the same approval again.

## Approved resources and observed state

| Resource or setting | Current state |
| --- | --- |
| Worker `astrabrowse-backend` | Deployed at [astrabrowse-backend.quirk.workers.dev](https://astrabrowse-backend.quirk.workers.dev). Latest version: `e031dfdb-bac7-4b53-bb12-98cf4c09f0a4`. |
| Private R2 bucket `astrabrowse-artifacts` | R2 enabled and bucket created; bound as `ARTIFACTS`. The earlier activation error is resolved. |
| AI Gateway `astrabrowse-demo-gateway` | Existing gateway reused; its identity and configured OpenAI BYOK key were verified in the dashboard. No credential value was copied into source or the client. |
| Workers AI binding `AI` | Added to the approved `production` environment for automatic gateway authentication. |
| Browser Run binding `BROWSER` | Configured; the first live capture of the hosted finance source succeeded. Sessions are temporary and created on demand. |
| Rate limiter `RESOLVE_RATE_LIMITER` | Configured with namespace `2026090801`, limit 10 requests per 60 seconds. This is not a global spending cap. |
| `AI_GATEWAY_ID` | Set to `astrabrowse-demo-gateway`. |
| `AI_GATEWAY_BYOK_ALIAS` | Unchanged at `openai-astrabrowse-demo`. Earlier alias failures are preserved below; later fresh Wikipedia and IANA conversions verified the existing model route without this rollout changing credentials. |
| `CLOUD_EXECUTION_APPROVED` | `false` in top-level local settings; `true` in `production`. |
| Deployment commands | `npm run deploy` and `npm run deploy:dry-run` select `--env production`; the dry run does not deploy. |
| Workers billing plan | Workers Paid active at $5/month plus usage. Pete explicitly approved the upgrade and completed checkout himself; Cloudflare confirmed purchase complete and subscription active. |

No Durable Object, queue, KV namespace, D1 database, cron trigger, new provider credential, public R2 endpoint, custom domain, or authenticated-source session was included in this resource list.

## Initial live integration checkpoint (superseded by later cold-conversion evidence)

**Verified:** hosted shared-cache resolution returned finance and Hacker News bundles with validated `gpt-6-astra` provenance, complete artifact structure, and matching manifest hashes. These generated artifacts exist independently of the labeled local fixture.

**Failed checks:** the unfamiliar IANA cold request returned `CONVERSION_FAILED` after capture-stage events and before Live View, so it did not establish current model credential usability. Finance revalidation returned HTTP 200, advanced `sourceCheckedAt`, and passed bundle/spec/recipe/generation checks, but `changed: false` and unchanged content failed the expected-change assertion. A live changing-content demonstration is not verified.

The initial unified route returned `7003`; earlier provider-native alias attempts returned `2040`. Peter later reported a duplicate `default` secret after removing its visible gateway entry; its underlying secret still exists. No secrets were deleted. Preserve existing credentials and distinguish old artifact availability from current provider access. No credential values were inspected in this documentation task. See [verification evidence](local-verification.md).

## Continuing within the approved scope

The approved bounded checks were attempted and their partial results are recorded above. Further debugging must preserve existing resources, credentials, and useful cached artifacts. Streaming conversion has a 90-second deadline and depends on a connected client. Duplicate suppression is per Worker isolate; conditional R2 publication rejects a writer whose starting manifest changed but does not provide globally unique jobs or a transaction across both objects.

Keep default local development cloud-disabled. The listed resources/configuration and bounded checks were approved, and Peter subsequently authorized committing and pushing all current work. Additional resources, secrets, schedules, or broader remote operations beyond that scope require separate confirmation. Repository visibility and hackathon submission are separate actions. This documentation update made no cloud calls, credential changes, or secret deletions.


## September 8 reliability rollout

Pete approved proceeding with commit/push, reconciliation with remote main, and deployment of the reviewed reliability fixes. Main includes fix commits `e2e2bbb` and `0ea5690`; merge `e1b1fb0` preserved the remote README branding and demo links. The existing Worker was redeployed as `41a3af5a-7511-4517-a3d6-62da78708c61` with the same R2, Browser Run, AI, gateway, and rate-limit bindings. No resources, credentials, billing plans, or limits were created or changed.

Post-deployment checks validate Wikipedia shared-cache delivery, the initial connected/request-ID event, exactly one terminal SSE event, and immutable artifact hashes. New capture of the previously failed OpenAI developer page receives `BROWSER_RATE_LIMITED` from a real SDK HTTP 429 response, including on a later native retry. At that checkpoint the account dashboard showed Workers Free as the current plan; an active-session listing was empty. This proved a provider-limit failure, not a successful new conversion. A paid-plan upgrade had not yet been approved or completed; its later explicit approval and activation are recorded below. See [current verification](local-verification.md).


## September 8 Workers Paid activation and unchanged-code redeployment

Pete explicitly approved the Workers Paid subscription at $5/month plus usage. He completed checkout himself; the dashboard confirmation showed purchase complete and subscription active. This is the authorized billing change. No payment details or credentials were copied into source or verification output.

The existing Worker was redeployed successfully as `e031dfdb-bac7-4b53-bb12-98cf4c09f0a4` with the same code, R2 bucket, Browser Run binding, AI binding, gateway, and rate limiter. Wikipedia shared-cache resolution and a fresh IANA reserved-domains conversion both passed the hosted checker, including exact manifest/artifact/model validation. The fresh request observed Live View and browser closure, reached validation at 30.46 seconds, and then returned ready. This is evidence from the successful run, not a guarantee that no later rate limit can occur. The finance changing-content check remains unresolved. See [current verification](local-verification.md).
