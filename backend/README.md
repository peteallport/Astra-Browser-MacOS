# Backend infrastructure scaffold

This Worker currently implements only `GET /health` and `HEAD /health`. It always reports `status: "infrastructure_scaffold"` and `ready: false`. Binding-presence booleans do not verify credentials, account entitlements, resource existence, or connectivity. No browser launch, model call, storage operation, refresh job, or rate-limit consumption occurs.

## Local development

Use Node.js 22 or newer. From this directory:

```sh
npm ci
npm run types
npm run typecheck
npm run deploy:dry-run
npm run dev
```

The development server uses local bindings. No account credentials are needed for this health scaffold. Open `http://localhost:8787/health`; other paths return 404, and unsupported health methods return 405. `HEAD /health` has no body. Do not enable remote bindings merely to test health.

| Script | Purpose |
| --- | --- |
| `dev` | Run Wrangler's local development server |
| `types` | Regenerate runtime and binding types from `wrangler.jsonc` |
| `typecheck` | Check TypeScript without producing JavaScript |
| `deploy:dry-run` | Validate and bundle locally into ignored `dist/`; does not deploy |
| `deploy` | Deploy the Worker to the selected Cloudflare account |

Generated `worker-configuration.d.ts` contains only scaffold defaults. After changing environment configuration, inspect regenerated types before committing; never commit credentials or personal account settings. Wrangler may need permission to bind a loopback port for type generation and local development. Set `WRANGLER_LOG_PATH=.wrangler/logs` if the environment restricts its default log directory.

## Declared infrastructure

| Binding | Resource/default | Current use |
| --- | --- | --- |
| `BROWSER` | Cloudflare Browser Run | Declaration only |
| `ARTIFACTS` | Private R2 bucket `astrabrowse-artifacts` | Declaration only |
| `RESOLVE_RATE_LIMITER` | Namespace `2026090801`, 10 requests per 60 seconds | Declaration only; enforcement is not implemented |

Confirm that the proposed rate-limit namespace is unique in the chosen account before deploying. Counters are approximate and local to each Cloudflare location, so this binding is not a global spending cap. See [Browser Run configuration](https://developers.cloudflare.com/browser-run/reference/wrangler/) and [rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Nonsecret settings in `wrangler.jsonc`:

| Setting | Default |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Empty; configure when connecting AI Gateway |
| `AI_GATEWAY_ID` | `astrabrowse` |
| `AI_GATEWAY_AUTH_MODE` | `byok` |
| `AI_GATEWAY_BYOK_ALIAS` | `default` |
| `ASTRA_MODEL` | `gpt-6-astra` |
| `ASTRA_REASONING_EFFORT` | `low` |

These are intended integration settings, not evidence of provisioned access. Wrangler's deployment account selection is separate from the Worker's `CLOUDFLARE_ACCOUNT_ID` variable; select the intended account explicitly during later setup.

## Configure hosted access later

These steps are documentation only; scaffold creation does not provision or deploy anything. When deployment is authorized, select a Cloudflare account, ensure Browser Run and R2 are available, create an AI Gateway named `astrabrowse` (or change the setting), and configure its authentication and OpenAI BYOK credential in the Cloudflare dashboard.

The intended provider endpoint is:

```text
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai/responses
```

Store the OpenAI provider key in AI Gateway. The future Worker adapter will use a `CF_AIG_TOKEN` Worker secret for the `cf-aig-authorization` header and the selected BYOK alias. The native app receives neither credential. A separately selected per-request provider-key mode could use an `OPENAI_API_KEY` Worker secret, but that mode is not implemented. Provider model access and Responses/SSE/structured-output behavior must be verified when the real adapter is built. See [OpenAI provider routing](https://developers.cloudflare.com/ai-gateway/usage/providers/openai/), [BYOK](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/), and [Gateway authentication](https://developers.cloudflare.com/ai-gateway/configuration/authentication/).

For local integration work later, copy `.dev.vars.example` to the ignored `.dev.vars` file and enter values locally. Do not put credentials in `wrangler.jsonc`, source files, command arguments, screenshots, or the native client.

The following commands **create or change hosted resources** and have not been run:

```sh
# After choosing/authenticating the intended Cloudflare account:
npx wrangler r2 bucket create astrabrowse-artifacts
npm run deploy
# Enter the gateway token at Wrangler's secret prompt, not as an argument:
npx wrangler secret put CF_AIG_TOKEN
```

Keep the R2 bucket private; artifact delivery belongs in the future Worker implementation. See [R2 bucket creation](https://developers.cloudflare.com/r2/buckets/create-buckets/) and [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Dependency notes

There are no runtime npm dependencies. Development tooling is pinned in `package-lock.json`. A narrow `sharp` override to `0.35.4` patches Miniflare's transitive image library for [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c); remove the override when upstream selects a fixed version. This scaffold does not process images.
