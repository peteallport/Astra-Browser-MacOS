# Local and hosted verification — September 8, 2026

The local macOS app and TypeScript implementation were exercised before cloud activation. These checks do not constitute a live Astra transformation. The native example is explicitly labeled **LOCAL TEST FIXTURE**, uses a hand-authored layout, and runs the same deterministic extractor, A2UI validation, HTTP delivery, and update machinery as the production adapters.

## Verified locally

| Check | Result and scope |
| --- | --- |
| macOS build | `./script/build_and_run.sh --verify` built and launched the integrated app with local ad-hoc signing. No app-code warnings. The resolved packages require Swift 6.2+. |
| Current verified toolchain | Xcode 27.0 (`27A5237l`) with Swift 6.4 via `xcrun`; the final native build and SSE regression check passed. The bare `PATH` Swift reports 5.3.3, so use the Xcode build script/toolchain. |
| Generated types | The final generated binding-types `--check` passed after correcting the generated file. |
| Local protocol bridge | The real TypeScript router's SSE, manifest, bundle, and content-only refresh decoded through the Swift models. This local integration check does not change the hosted failure results below. |
| Backend | Typecheck and the latest 25 tests passed. Coverage includes validated publication, ETags, coalescing, refresh without model calls, recipe drift, safe errors, cancellation, stale writes, policy checks, and injected browser/model behavior including provider-native BYOK alias selection. |
| Worker packaging | Wrangler deployment dry run passed. Actual local Worker health/HEAD, finance HTML, and cloud-gated resolve were exercised before the separately approved production deployment. |
| Source | Finance HTML displayed 20 fictional companies, explicit simulated-data labeling, and correct source values. Values stayed stable within each 30-second interval and changed across the boundary. |
| Native rendering | The real A2UI-Swift decoder rendered repeated finance rows and source-bound fields. Filtering “Orbit” left only ORBT. |
| Offline reopening | With the fixture server stopped, a fresh app launch reopened saved finance content from disk and showed an accurate network warning. |
| Pending content | While scrolled down, an automatic update left visible values unchanged and added the sidebar badge. Reaching the top applied the latest revision and removed the badge. |
| Automatic update at top | While remaining at scroll position zero, the next scheduled update advanced the capture time and source values without leaving a pending badge. |
| Return-to-top button | After reconnecting, a staged update was applied by the button; the actual scroll position reached zero and the badge cleared. |
| Tab reading position | Switching away and back restored the same measured scrollbar position, 0.246943179, in the runtime check. |
| Original fallback | The explicit Original Website action displayed the real Hacker News site in the same tab. Returning to Native View removed its WebKit content and restored the fixture. |
| SSE | A focused regression check passed LF, CRLF, CR, UTF-8, comment, blank-boundary, and multiline-data cases after detecting and fixing line-sequence framing loss. |
| Licensing | Pinned Swift packages and backend dependencies are documented. Reviewed Swift license texts and third-party notices are included in native resources. |
| Cloud boundary | The top-level local environment sets `CLOUD_EXECUTION_APPROVED=false` and refuses cloud transports before binding calls. The separately approved production environment enables `AI`, Browser Run, R2, and the rate limiter. |

## Commands

From the repository root:

```sh
./script/build_and_run.sh --verify
xcrun swiftc -parse-as-library AstraBrowse/Services/SSEParser.swift script/verify_sse.swift -o /tmp/astrabrowse-sse-check
/tmp/astrabrowse-sse-check
```

From `backend/`:

```sh
npm ci
npm run typecheck
npm test
npm run deploy:dry-run
npm run dev:fixture
```

The fixture server uses `http://localhost:8787`. Configure that URL in the app’s Backend Settings. It accepts public HTTPS page identities but serves labeled local fixture data, without fetching those websites. The source webpage is `/demo/finance`.

## Earlier hosted verification and remaining evidence

Peter approved the listed cloud resources/configuration, deployment, and bounded live conversion/revalidation at approximately 4:40 p.m. Pacific on September 8. The private R2 bucket exists and the Worker is deployed at [astrabrowse-backend.quirk.workers.dev](https://astrabrowse-backend.quirk.workers.dev). Last recorded deployment: `10874f03-669f-4b59-9e2b-dc448bda805f`.

| Hosted check | Actual result |
| --- | --- |
| Finance shared cache | Passed: complete bundle, exact `gpt-6-astra` provenance, and matching manifest hash. Saved generation time: `2026-09-09T00:14:30.485Z`; saved capture/check checkpoint: approximately `00:18:52Z`. |
| Hacker News shared cache | Passed: complete generated bundle and matching manifest hash; generation recorded at `2026-09-09T00:18:56.302Z`. |
| Unfamiliar IANA cold conversion | Failed around `2026-09-09T00:22Z`: capture-stage events followed by `CONVERSION_FAILED`, before Live View. This did not establish current model credentials or a successful fresh conversion. |
| Finance revalidation | HTTP 200 and newer `sourceCheckedAt`; bundle, spec, recipe, and generation checks passed. `changed` was `false` and content stayed unchanged despite more than 60 seconds, so the expected-change assertion failed. No new source content is confirmed. |

The finance recipe includes price, change, and the source snapshot footer; the cached footer remained `00:18:30Z`. The revalidation checker aborted at the failed changed-content assertion before saving. Therefore the local evidence file's `00:18:52Z` check time is the earlier checkpoint, not the newer server `sourceCheckedAt` observed in that response. Advancing a check timestamp does not establish refreshed content or a completed live-update demonstration.

Earlier model integration attempts returned unified-route `7003` and provider-native alias `2040`. Peter later reported a duplicate-secret error after removing the visible gateway `default` entry; its underlying secret still exists. No secrets were deleted. At that checkpoint, provider credential usability remained unverified, and the documentation task inspected no credential values. The later Wikipedia check below supersedes this uncertainty. Cached generated artifacts must not be presented as proof that a fresh model request currently works.

At this earlier checkpoint, typecheck, 25 local tests, and production dry-run bundling passed. Remote Live View embedding, successful unfamiliar-domain conversion, a changing-content hosted refresh, generated-page native runtime acceptance, and comparative memory/speed measurements remained unverified. The macOS 14 scroll fallback compiled but was not runtime-tested.

The [activation record](cloud-change-proposal.md) preserves existing approval without requiring it again. Peter also explicitly authorized committing and pushing the current work; additional unapproved cloud operations, repository visibility changes, and hackathon submission remain separate.

The dependency audit reports a Puppeteer transitive archive-extraction advisory; see the [backend dependency notes](../backend/README.md#current-limits-and-evidence). Local tests do not clear it.


## September 8, 6:22 p.m. Pacific reliability investigation

The reported native message, `The conversion stream ended before a result arrived`, means an HTTP-success SSE stream ended without a `ready` or `error` event. Expanded Swift parser tests preserve terminal events without final delimiters and distinguish a genuinely incomplete stream from malformed JSON; no native parser defect was reproduced.

A controlled curl request for `https://en.wikipedia.org/wiki/Web_browser` completed through capture, Live View, Astra planning, compilation, validation, and `ready` in 42.7 seconds (HTTP 200). The Worker tail recorded `outcome: ok` with no exception. Its immutable artifact passed local bundle validation, exact revision verification, and `gpt-6-astra` provenance verification. Generation time was `2026-09-09T01:21:55.294Z`, revision `9228577c2139ce85e497bdd2a92c51078d406b7a6aef2c7e656cd44e660afbe0`. Retrying the existing Wikipedia tab then rendered that native page successfully. This supersedes earlier uncertainty about current model access, but does not establish the cause of every intermittent failure.

Local workerd reproduction identified a separate shared-job lifecycle defect: disconnecting the request that owns a conversion can strand another waiting request beyond the configured job deadline. Browser inspection also found that `Verifying your browser` challenge pages could be accepted as content, and several browser operations/cleanup calls lacked individual bounded waits. The local fix keeps each request's I/O, timers, cancellation, and stream within that request; followers read bounded plain-data progress and have independent deadlines. Cancellation now delivers explicit terminal errors instead of stranding followers. Browser operations have bounded waits, original source errors survive cleanup failures, optional related-page failures preserve primary evidence, known verification pages are withheld from publication/cache delivery, and expired Live View results are not replayed. At this investigation checkpoint these changes had not yet been deployed; no cloud configuration or credentials were changed. The subsequent deployment is recorded below.


Final local verification passed: TypeScript typecheck, all 41 backend tests (including the reproduced cancellation case in local workerd), production dry-run bundling, Swift SSE regressions, the actual TypeScript-to-Swift protocol/refresh checks, and the macOS build. The native failure heading now says “Couldn't create a native view” instead of implying every transport failure requires the original site. These checks do not establish that every previously reported intermittent EOF has the same cause.

Icon Composer verification found the open saved document at `Documents/ChatGPT/AstraBrowse/design/icon-composer/AstraBrowse.icon` byte-identical to the canonical repository's `AstraBrowse.icon` (13 files). Debug and Release already select `AstraBrowse` as the app icon and include the Icon Composer package as a resource. The fresh build contains compiled `Assets.car` and `AstraBrowse.icns`; its Info.plist selects `AstraBrowse`, and the compiled icon visually matches the saved design. The running app's system-provided icon (NSRunningApplication.icon, PID 85150) was also inspected and matches the saved design. No replacement artwork, target-setting change, or relaunch was needed; tabs and cache were preserved.


## September 8 reliability deployment and remaining provider limit

After Pete approved proceeding, the reviewed reliability fixes were committed and pushed to `main`, preserving the remote README updates without conflict. Fix commits: `e2e2bbb` (request/browser lifecycle) and `0ea5690` (actual SDK error classification); merge: `e1b1fb0`. The first rollout was `01ba4e58-612f-41ca-be47-491781fe6516`; the final Worker deployment at that checkpoint was `41a3af5a-7511-4517-a3d6-62da78708c61`. Bindings and credentials were unchanged.

The pinned Puppeteer SDK throws launch failures as a plain Error with a status-code prefix; it does not populate `error.status`. The follow-up classifies only that exact prefix and known daily-quota text, never exposing provider bodies. Typecheck, all 44 backend tests, and production dry-run bundling pass after the follow-up. The earlier Swift protocol/SSE checks and native build remain valid; the follow-up changes only backend launch-error classification.

| Post-deployment check | Observed result |
| --- | --- |
| Wikipedia shared cache | Passed: connected at 0.14 seconds, cache status at 0.32 seconds; matching request-ID header/event, one ready terminal, no Browser Run/Live View stage; live manifest and immutable artifact validate against the actual bundle/hash/provenance rules. Request ID: `d2efd02c-6170-4db1-858c-845c438341cc`. |
| OpenAI developer model page | Failed conversion, valid error protocol: connected/capture followed by `BROWSER_RATE_LIMITED`, from SDK HTTP 429. Request ID: `e717d128-4a95-4f16-9852-207c159c6b00`. This was not a successful source capture/model generation. |
| Native retry after cooldown | The existing failed tab now displays “Browser Run is temporarily at its session or launch limit. Try again shortly.” The later retry also failed; no fresh native transformation is claimed. |
| Account/session state | Workers plans dashboard shows Free as Current plan. `wrangler browser list --json --env production` returned an empty list at the check. The exact provider quota behind HTTP 429 was not established. |

The checker used curl for network transport, required a connected event plus matching request-ID response header and exactly one ready/error terminal, and validated all successful published bundles with the project's actual TypeScript validators. It exited with conversion failure while reporting protocol success, preserving the distinction. Cached-challenge HTTP rejection remains locally tested; that optional live check was skipped.

[Cloudflare's limits documentation](https://developers.cloudflare.com/browser-run/limits/) states that Workers Free has a launch limit of one new browser per 20 seconds and a daily browser-time quota. At that checkpoint this account had not been upgraded; the paid-plan page displayed $5/month plus usage, and a change still required separate approval. The subsequently approved activation is recorded below. The deployment resolves the reproduced request-lifetime defect and improves error handling, but cannot remove account limits. Hard-cancellation/late-launch browser closure remains best effort once the owning invocation ends; an empty session listing is not proof of every historical cleanup outcome.


## September 8 Workers Paid activation and post-upgrade verification

Pete explicitly approved Workers Paid at $5/month plus usage and completed checkout himself. Cloudflare displayed purchase complete and confirmed the subscription active. The existing Worker was redeployed successfully as `e031dfdb-bac7-4b53-bb12-98cf4c09f0a4` with unchanged implementation, bindings, resource names, gateway, and credentials. The previously passing 44 backend tests, typecheck, production dry-run, Swift protocol/SSE checks, and macOS build still cover that unchanged code; they were not rerun solely for the billing change.

| Post-upgrade check | Observed result |
| --- | --- |
| Wikipedia shared cache | Passed: connected at 0.14 seconds and cache at 0.25 seconds, with no Live View/browser stage. Request ID `f6476d18-c8ec-4514-b292-6be18e94a356`; manifest, immutable artifact, exact revision, and Astra model validation passed. |
| Fresh [IANA reserved-domains conversion](https://www.iana.org/domains/reserved) | Passed: navigation at 1.72 seconds, inspection at 3.43 seconds, planning at 3.66 seconds, captured/browser-closure acknowledgment and compilation at 6.31 seconds, validation at 30.46 seconds, then ready. Temporary Live View was observed. This is validation-stage timing; the exact final terminal time was not printed. |
| IANA publication/provenance | The checker validated the actual manifest and bundle with the project validators, exact artifact hash, and requested Astra model. Request ID `5091f54f-3bb4-486e-9f41-0ca512cb1031`; page key `d00609d0ce967d1d9d97755ba963f495a4736f43ec8ee9326bb6a0102ccf072e`. Bundle revision `a351f443da44f241b4da68c6e453796783a034e1e7e72e0d87d799bb4cc1ebf8`; captured at `2026-09-09T01:52:32.268Z`, source checked at `2026-09-09T01:52:59.075Z`. The manifest had not advanced since ready (`advancedSinceReady: false`). Checker exit 0, `allConversionsPassed: true`. |
| Native recovered OpenAI developer page | The running app displayed “GPT-6 Astra Model | OpenAI API” with a 6:51 p.m. capture time and no error before this controlled checker run. This observation is separate from the controlled IANA cold request; it was not represented as that request's native rendering. |

The earlier Free-plan HTTP 429 observations remain valid historical evidence. The successful post-upgrade cold run supersedes that blocker for this check without proving all future requests are unlimited or every earlier EOF had the same cause. The finance expected-change assertion remains unresolved. No new changing-content acceptance result or comparative memory/speed benchmark is claimed.

The documentation checkpoint commit `b2c9bf7` also passed [GitHub CI](https://github.com/peteallport/Astra-Browser-MacOS/actions/runs/34300398929): backend, protocol, and macOS build jobs all succeeded.
