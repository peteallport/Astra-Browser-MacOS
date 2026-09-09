# Cloud configuration and deployment boundary

Use the [backend setup guide](../backend/README.md) to configure your own deployment. The tracked `backend/wrangler.jsonc` is a reusable template for local development and safe dry-run packaging. Copy it to the ignored `backend/wrangler.deploy.jsonc`, then replace its placeholders with values for your account. The deploy command validates that private file before uploading. The configuration template supplies no demo account, endpoint, resource identifier, or credential alias. Demonstration screenshots retain their originally captured source addresses.

## Deployment values

| Resource or setting | Value to supply |
| --- | --- |
| Cloudflare account | Your account ID, represented here as `<account-id>`. |
| Worker | Your Worker name (`<worker-name>`) and the resulting HTTPS backend URL. `https://backend.example.com` is a reserved example, not a service. |
| Private R2 bucket | Your bucket name (`<artifact-bucket-name>`), bound as `ARTIFACTS`. Keep artifacts private behind the Worker. |
| AI Gateway | Your gateway ID (`<gateway-id>`), configured for the required OpenAI Responses route. |
| Provider credential alias | Your configured alias (`<byok-alias>`); the key itself remains in server-side credential storage. |
| Browser Run | Logical binding `BROWSER`; sessions are temporary and created on demand. |
| AI binding | Logical binding `AI` for automatic gateway authentication within your account. |
| Rate limiter | Logical binding `RESOLVE_RATE_LIMITER`; replace namespace placeholder `0` with your own numeric namespace ID. The template permits 10 requests per 60 seconds, which is not a global spending cap. |
| Runtime gate | Keep default local `CLOUD_EXECUTION_APPROVED=false`; use the private production configuration only after explicitly authorizing that deployment. |
| Billing plan | Select a plan with sufficient Browser Run capacity for your use; verify current limits and charges before approving a change. |

The required architecture does not include a Durable Object, queue, KV namespace, D1 database, cron trigger, public R2 endpoint, custom domain, or authenticated-source session. These are separate design decisions if later needed.

## Configuration and permission boundaries

Copying a template and running local validation do not provision resources. Resource creation, provider credentials, billing changes, live model/browser requests, and deployment require the operator's authorization. Preserve existing resources and useful cached artifacts during fixes. A repository push does not change repository visibility, provision infrastructure, or submit a demo.

Keep the completed private deployment file ignored. Never place API keys, cookies, signed Live View URLs, or payment details in source, client settings, public evidence, or logs. The public app needs the backend URL; it does not need cloud or model-provider credentials. Use the [backend guide](../backend/README.md) as the command source of truth rather than copying commands from historical run records.

Streaming conversion has a 90-second deadline and depends on a connected client. Duplicate suppression is per Worker isolate; conditional R2 publication rejects a writer whose starting manifest changed but does not provide globally unique jobs or a transaction across both objects.

## Historical verification: September 8, 2026

A separately configured demo deployment verified Finance/Hacker News shared-cache bundles with exact Astra provenance and artifact hashes, plus fresh Wikipedia and IANA conversions. Wikipedia completed in 42.7 seconds and rendered natively. The later IANA check observed Live View and browser closure, reached validation at 30.46 seconds, then returned ready with validated publication. That is validation-stage timing, not a full end-to-end benchmark.

Earlier gateway routing/alias failures and Browser Run HTTP 429 responses were resolved sufficiently for those later successful runs. The test operator explicitly approved and completed a Workers Free-to-Paid upgrade; subsequent deployment retained the implementation, bindings, and credentials. These results neither configure a new installation nor guarantee that future requests avoid quotas.

Finance revalidation advanced its source-check time but did not produce the expected changed content. A hosted changing-content demonstration remains unverified. Hard-cancellation or late-launch browser closure remains best effort once the owning Worker invocation ends. See the [verification record](local-verification.md) for the scope and limits of the observed results.
