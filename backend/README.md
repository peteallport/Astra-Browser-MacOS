# AstraBrowse backend

The TypeScript Worker provides streaming URL resolution, immutable A2UI bundles, conditional manifests, and source revalidation. The repository contains deployment placeholders; use a private configuration for your own Cloudflare account. Start with the [root setup guide](../README.md#setup), [protocol](../docs/protocol.md), and [planning document](../planning.md).

## Local development

Use Node.js 24 or newer. From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run deploy:dry-run
npm run dev
```

`npm run dev` uses local bindings with cloud conversion disabled. `/health` and `/demo/finance` work; `/resolve` returns `CLOUD_APPROVAL_REQUIRED`. The default router never invokes the R2, browser, or model bindings. Keep `CLOUD_EXECUTION_APPROVED=false` for local development.

For a native/API check with no external services, stop Wrangler and run:

```sh
npm run dev:fixture
```

The fixture binds to `127.0.0.1:8787`; `LOCAL_FIXTURE_PORT` selects another port. In the native app's **Backend Settings**, enter `http://localhost:8787`, save, and open a public HTTPS address. The result is explicitly labeled **LOCAL TEST FIXTURE**, with a hand-authored layout and simulated finance content. It does not fetch or convert the entered website. It exercises the same bundle, ETag, revalidation, and native caching protocol as the Worker.

## Cloudflare setup

These steps create resources and can incur charges in **your** account. Checking out the repository, local tests, and dry runs do not provision them.

### 1. Prepare access and private configuration

Install dependencies, then authenticate Wrangler:

```sh
npm ci
npx wrangler login
npx wrangler whoami
cp -n wrangler.jsonc wrangler.deploy.jsonc
```

`cp -n` preserves an existing private file. Edit only `wrangler.deploy.jsonc` when filling in deployment values. Both it and local `.dev.vars` / `.env` files are ignored by Git. Never put provider keys or Cloudflare access tokens in the template, app source, or checked-in examples.

Replace **every occurrence**, including values under `env.production`:

| Template value | Replacement |
| --- | --- |
| `YOUR_CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID from the dashboard or `wrangler whoami` |
| `your-worker-name` | Your chosen Worker name, using letters, numbers, and hyphens |
| `your-r2-bucket-name` | The private R2 bucket you create below |
| `namespace_id: "0"` | A positive integer written as a string, unique to this rate limiter within your account |
| `YOUR_AI_GATEWAY_ID` | The ID of your AI Gateway in the same account |
| `YOUR_AI_GATEWAY_BYOK_ALIAS` | The exact alias of the OpenAI provider key saved in that gateway |

The namespace value `0` is a numeric placeholder for local tooling. Keep the logical binding names `ARTIFACTS`, `BROWSER`, `AI`, and `RESOLVE_RATE_LIMITER`; the code uses these names. The 10-request/60-second rate limit, compatibility date, and cloud execution flags are portable behavior defaults, not account identifiers. Top-level local execution stays `false`; the production environment enables it.

### 2. Prepare the cloud resources

| Resource | Setup |
| --- | --- |
| Worker | `npm run deploy` creates or updates the Worker named in your private production configuration |
| Private R2 bucket | Enable R2 and create the bucket in the [Cloudflare dashboard](https://dash.cloudflare.com/); use that name for `ARTIFACTS`. Keep public bucket access disabled |
| Browser Run | Confirm your account has Browser Run access and sufficient [quota](https://developers.cloudflare.com/browser-run/limits/). The `BROWSER` binding is declared in the configuration; there is no separate browser server to manage |
| AI Gateway | Create an authenticated gateway in the same account and configure the OpenAI provider key as described below |
| Rate limiter | Choose an unused positive namespace ID for the declared binding; no KV or database is required |

No D1, KV, Cron Schedule, Durable Object, queue, or public R2 domain is needed. The app initiates refresh checks while active. See the [Browser Run binding](https://developers.cloudflare.com/browser-run/reference/wrangler/) and [rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) documentation.

### 3. Store the OpenAI provider key

In Cloudflare, select **AI → AI Gateway → your gateway → Provider Keys**. Add an **OpenAI** API key whose project has access to `gpt-6-astra`, and record the saved credential alias in your private `AI_GATEWAY_BYOK_ALIAS` setting. Ensure gateway authentication is enabled. AI Gateway stores the actual provider key in Secrets Store; the dashboard manages the underlying secret. See [BYOK setup and aliases](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/).

The implementation uses `env.AI.gateway(env.AI_GATEWAY_ID).run(...)` with the provider-native `openai` / `responses` envelope and the outer `cf-aig-byok-alias` header. The Worker's `AI` binding handles Cloudflare authentication. There is no `OPENAI_API_KEY` or `CF_AIG_TOKEN` to add to this app or Worker configuration. The model is `gpt-6-astra` with low reasoning effort and schema-constrained output; a successful deployment does not establish that your provider account has model access.

The gateway ID is a name, not a URL. The native app connects to your **Worker URL**, not the AI Gateway API URL. See the implementation in [astra.ts](src/translation/astra.ts) and the [OpenAI provider route](https://developers.cloudflare.com/ai-gateway/usage/providers/openai/).

### 4. Validate, then deploy

```sh
npm run deploy:check
npm run deploy -- --dry-run
```

The first command checks that the private file exists and has no template placeholders. The second invokes Wrangler against that private file to validate and bundle it without uploading. Both commands are local checks; neither confirms cloud resource existence, credentials, or successful conversion.

When the configuration and resources are ready, publish the Worker:

```sh
npm run deploy
```

This command uses **`wrangler.deploy.jsonc --env production`**. It refuses missing or unfilled private configuration. Do not deploy the checked-in template directly. The deployment output prints your Worker URL, in the form `https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev`.

### 5. Connect and verify

Enter the printed HTTPS URL in the native app's **Backend Settings** and save it. Open a public source such as `https://www.iana.org/domains/reserved`. A successful cold conversion should show progress and end with a native view; opening it again should reuse the cached bundle. Visit your Worker's `/demo/finance` path as a source to try simulated quote updates.

`/health` verifies only that the process responds. A terminal `ready` event and validated published artifact establish a successful conversion. Troubleshooting and known acceptance gaps are recorded in [local-verification.md](../docs/local-verification.md).

## Command reference

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local Wrangler server, cloud conversion disabled |
| `npm run dev:fixture` | Local protocol fixture for native integration |
| `npm run types` | Regenerate checked-in types from the public template; do not point this command at private config |
| `npm run typecheck` | TypeScript verification |
| `npm test` | Local router, publication, extraction, compiler, policy, and transport tests |
| `npm run deploy:dry-run` | Bundle the placeholder production template into ignored `dist/`, without account setup or upload |
| `npm run deploy:check` | Check private deployment configuration for missing values, without cloud access |
| `npm run deploy -- --dry-run` | Validate and bundle private configuration without upload |
| `npm run deploy` | Deploy private production configuration to Cloudflare |

Wrangler may need local filesystem and loopback-listener permission. `WRANGLER_LOG_PATH` can select a writable log location. Inspect generated types before committing them; the public template prevents your deployment values becoming generated literal types. The [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/commands/) documents `--config` and `--dry-run`.

## Implemented contract

| Endpoint | Behavior |
| --- | --- |
| `GET /health`, `HEAD /health` | Implemented features, execution mode, and explicitly unverified cloud readiness |
| `POST /resolve` | `{url}` request; SSE `status`, transient `liveView`, and terminal `ready` or `error` |
| `GET /pages/:key/manifest` | Current manifest with ETag and conditional 304 |
| `POST /pages/:key/revalidate` | JSON `{manifest,changed}`; recent checks reuse the prior result |
| `GET /artifacts/:revision` | Validated immutable bundle with content-based identity |
| `GET /demo/finance` | Public source HTML with clearly labeled simulated quotes changing every 30 seconds |

Resolution has a 90-second total deadline. Concurrent requests for the same page share progress within one Worker isolate. I/O belongs to the initiating request; cancelling that owner aborts its work and gives followers a terminal cancellation error. Cancelling only a follower leaves the owner running. A validated bundle is persisted before a conditional manifest write publishes it. Failed conversions and refreshes preserve the prior valid manifest.

Source revalidation defaults to 60 seconds. It reuses the extraction recipe and makes no model call while that recipe remains compatible; extraction incompatibility triggers bounded repair compilation. Unchanged content advances freshness without changing the bundle revision. Native clients poll manifests every 15 seconds and decide when to apply pending content.

## Limits and configuration privacy

The public Worker API has **no client authentication**. Anyone with its URL can request a conversion. The rate limiter is approximate and local to a Cloudflare location, so it is not a global spending cap. `CLOUD_EXECUTION_APPROVED` enables server-side cloud execution; it does not authenticate callers.

There is no durable job queue or global single-compilation guarantee. Streaming work needs an active client connection. R2 conditional writes prevent stale manifest overwrites. Only public HTTPS pages are supported; destination/DNS checks do not constitute complete egress hardening. Authentication, private sessions, forms, and access-control bypass are unsupported. Temporary Live View URLs never belong in stored artifacts or committed logs.

The [verification record](../docs/local-verification.md) retains observed conversion outcomes and known gaps without publishing deployment identifiers. Removing values from current source does not erase them from Git history. Keep private configuration and logs out of commits.

Runtime dependencies are pinned `@cloudflare/puppeteer` and `linkedom`. The Puppeteer dependency tree has reported `extract-zip` archive-extraction advisories; the Worker uses remote Browser Run rather than browser download/archive extraction APIs. This does not clear that advisory. The `sharp` development override remains pinned to `0.35.4`; dependency changes need separate review.
