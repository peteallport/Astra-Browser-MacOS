# Local and hosted verification — September 8, 2026

This public record preserves observed behavior and timing while omitting deployment URLs, account/resource names, credential aliases, private paths, and raw deployment/request/artifact identifiers. Historical success does not establish readiness of a new installation. Configure your own deployment through the [backend setup guide](../backend/README.md).

## Verified locally

The native example is explicitly labeled **LOCAL TEST FIXTURE**. It uses a hand-authored layout with the same deterministic extractor, A2UI validation, HTTP delivery, and update machinery as the production adapters; it is not a live Astra transformation.

| Check | Result and scope |
| --- | --- |
| macOS build | The integrated app built and launched with local ad-hoc signing and no app-code warnings. Resolved packages require Swift 6.2+. The final local native/SSE checks used Xcode 27 with Swift 6.4; use the configured Xcode toolchain rather than an unrelated `swift` on `PATH`. |
| Backend and generated types | Typecheck, generated-type freshness, and all 44 backend tests passed. Coverage includes publication, immutable identity, ETags, coalescing, request cancellation, freshness, repair, URL policy, deterministic extraction, and injected model/browser transports. |
| Local protocol bridge | Real TypeScript router SSE, manifest, bundle, and content-only refresh decoded through the production Swift models. |
| Worker packaging | The reusable configuration passed local dry-run bundling. Local health/HEAD, finance HTML, and cloud-gated resolve were exercised without cloud execution. |
| Controlled source | Finance HTML displayed 20 fictional companies and explicit simulated-data labeling. Quotes stayed stable within each 30-second interval and changed across an interval boundary. |
| Native rendering | The pinned A2UI decoder rendered repeated source-bound finance rows; filtering narrowed the visible collection. |
| Offline reopening | After stopping the fixture server, a fresh app launch reopened saved content from disk and showed an accurate network warning. |
| Pending updates | While scrolled down, an automatic update preserved visible values and added a sidebar badge. Returning to the top applied the pending revision and removed the badge. |
| Automatic update at top | At the top, the next scheduled fixture update advanced displayed source values without leaving a pending badge. |
| Reading position | Switching tabs restored the measured scrollbar position; return-to-top applied a staged update and reached zero. |
| Original fallback | Original Website displayed the real Hacker News page in the same tab. Returning to Native View removed WebKit content and restored the native fixture. |
| SSE framing | LF, CRLF, CR, UTF-8, comments, blank boundaries, multiline data, terminal-event EOF, server errors, status-only EOF, empty streams, and truncated JSON checks passed. |
| Licensing | Pinned dependency notices and reviewed Swift license texts are included in native resources. |
| Cloud boundary | Default local execution is disabled and refuses cloud transports before binding calls. |
| Hosted CI | Backend, protocol, and macOS build jobs passed for the verified implementation. See the [workflow](../.github/workflows/ci.yml) and [contributor guide](../CONTRIBUTING.md). |

Use the current [local verification commands](../CONTRIBUTING.md#local-verification) and [backend guide](../backend/README.md). The local fixture uses `http://localhost:8787`, configured in the app's Backend Settings. It accepts public HTTPS page identities but serves labeled fixture data without fetching those sites. The finance source route is `/demo/finance` on the backend you configure.

## Portable configuration verification

After replacing deployment identifiers with placeholders, all 44 existing backend tests and three new private-deployment configuration checks passed. The new checks verify rejection of a missing private file, rejection of an unfilled template, and a configured check that never invokes Wrangler. Typecheck, generated-type freshness, and placeholder production dry-run bundling passed. Local Wrangler health reported cloud-disabled; resolve returned `CLOUD_APPROVAL_REQUIRED`, and the temporary verification server was stopped.

The updated native app built and launched with saved tabs restored. Without a saved backend URL it displays **Configure Backend**. Existing saved settings and process-level environment overrides remain supported. No cloud configuration or deployment changed during this cleanup. The private deployment file is ignored by Git, and tracked text plus decoded documentation links no longer contain the reference deployment identifiers. Earlier Git history is unchanged.

## Hosted conversion and caching evidence

These checks used a separately configured reference deployment. Exact manifest, artifact, revision, and requested-model checks were performed with the project's real validators. Private identifiers are omitted; `gpt-6-astra`, public source domains, protocol fields, and measured timing remain meaningful verification details.

| Check | Observed result |
| --- | --- |
| Finance and [Hacker News](https://news.ycombinator.com/) shared cache | Passed complete generated-bundle validation, matching manifest/artifact hashes, and exact requested Astra provenance. These results are distinct from the local hand-authored fixture. |
| Fresh [Wikipedia Web browser](https://en.wikipedia.org/wiki/Web_browser) conversion | HTTP 200, capture, Live View, Astra planning/compilation, publication, and ready completed in 42.7 seconds. Worker logs recorded a successful outcome without an exception. The generated artifact passed exact validation and subsequently rendered in the macOS app. |
| Later Wikipedia warm path | Connected at 0.14 seconds; cache status at 0.25 seconds. The request ID matched across the header and event, exactly one ready terminal arrived, no browser/Live View stage appeared, and the manifest/artifact/provenance checks passed. An earlier warm check observed cache status at 0.32 seconds. |
| Fresh [IANA reserved-domains](https://www.iana.org/domains/reserved) conversion | Navigation at 1.72 seconds, inspection at 3.43 seconds, planning at 3.66 seconds, captured/browser-closure acknowledgment and compilation at 6.31 seconds, validation at 30.46 seconds, then ready. Live View was observed. The exact final terminal time was not printed; 30.46 seconds is validation-stage timing, not an end-to-end benchmark. |
| IANA publication | The checker passed actual manifest/bundle validation, exact artifact hash, and requested model provenance. The manifest had not advanced since ready. Checker exit 0 and all conversions passed. |
| Native recovered OpenAI developer page | The app displayed generated content for “GPT-6 Astra Model — OpenAI API” without an error. This observation was separate from the controlled IANA check and was not represented as native rendering of that IANA result. |

## Failure history and reliability fixes

An earlier IANA request failed after capture-stage events and before Live View. Initial model integration also encountered unified-route `7003` and provider-native alias `2040` errors. A gateway duplicate-secret error followed removal of a visible credential entry. No credential values were copied into evidence and no secrets were deleted by these fixes. Later fresh Wikipedia and IANA successes establish access for those runs; a cache hit alone would not have done so.

The reported native message “The conversion stream ended before a result arrived” meant an HTTP-success SSE response closed without a terminal ready/error event. Expanded Swift parser checks reproduced no parser defect. A local workerd regression did reproduce owner-request cancellation stranding a shared-conversion follower beyond its deadline. The fix keeps I/O, timers, cancellation, and stream writes owned by the initiating request; followers read plain-data progress and have independent deadlines. Owner cancellation now produces explicit terminal errors, while cancelling a follower leaves the owner running.

Browser operations and cleanup waits are individually bounded. Original source errors survive cleanup failure, unavailable optional related pages retain useful primary evidence, recognized browser-verification pages are withheld from publication/cache delivery, and closed Live View results are not replayed. The pinned Browser Run SDK's actual launch-error shape is classified into safe errors without exposing provider response bodies.

The reference deployment subsequently returned explicit `BROWSER_RATE_LIMITED` errors from SDK HTTP 429, including after a native retry. At that checkpoint the test account used Workers Free and an active-session listing was empty; the exact quota behind that response was not established. Its operator later approved and completed a Paid upgrade. An unchanged-code redeployment then passed the fresh IANA run recorded above. See [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/) for current quotas; historical success does not remove account limits.

## Unresolved acceptance and limits

Finance revalidation returned HTTP 200, advanced `sourceCheckedAt`, and passed bundle/specification/recipe/generation checks, but `changed` was false and content remained unchanged after more than 60 seconds. The expected-change assertion failed, and the checker stopped before saving its newer local checkpoint. Advancing a source-check timestamp does not establish refreshed content. The hosted finance changing-content demonstration remains unresolved even though local fixture updates passed.

Hard-cancellation or late-launch browser closure remains best effort once the owning Worker invocation ends. An empty session listing does not prove every historical cleanup outcome. The original cause of every intermittent EOF was not established. The macOS 14 scroll fallback compiled but was not runtime-tested. Native rendering of the controlled IANA result was not checked. Comparative memory/speed benchmarks, Intel compatibility, and notarized distribution remain unverified.

The saved `AstraBrowse.icon` package is selected by Debug and Release and included as a resource. The built `Assets.car`, `AstraBrowse.icns`, Info.plist selection, and running app icon were inspected and matched the saved design. No personal document path or process identifier is needed to reproduce that check.

A Puppeteer transitive archive-extraction advisory remains documented in the [backend dependency notes](../backend/README.md#limits-and-configuration-privacy). Passing local tests does not clear that dependency advisory.
