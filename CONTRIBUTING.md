# Contributing to AstraBrowse

Start with [planning.md](planning.md), the source of truth for scope and approved decisions, then read the [README](README.md) and [wire protocol](docs/protocol.md). Keep implemented, locally verified, and deployed behavior distinct. A local fixture or successful build does not demonstrate a real Astra conversion.

## Repository structure

| Path | Responsibility |
| --- | --- |
| `AstraBrowse/App`, `Views`, `Stores`, `Models` | SwiftUI app, browser navigation/update state, and wire models |
| `AstraBrowse/Services` | Backend transport, byte-oriented SSE parsing, atomic page cache, and A2UI integration |
| `AstraBrowse/Resources` | Bundled dependency licenses and notices |
| `AstraBrowse.xcodeproj` | Shared `AstraBrowse` scheme, macOS target, and pinned Swift packages |
| `backend/src/router.ts`, `artifacts.ts`, `protocol.ts`, `validation.ts` | HTTP/SSE contract, immutable bundles, conditional manifests, and validation |
| `backend/src/translation` | Public-source policy, capture, Astra compilation, and deterministic extraction; injected-adapter tests live here |
| `backend/src/cloud.ts`, `index.ts` | Cloud adapters and the default-disabled execution gate |
| `backend/src/demo`, `local-fixture.ts`, `scripts/local-fixture.ts` | Synthetic finance source and explicitly labeled local fixture server |
| `backend/test` | Router, storage, concurrency, cancellation, and refresh tests |
| `script/build_and_run.sh`, `script/ci` | Native build/run entrypoint and cross-language protocol checks |
| `docs`, `planning.md`, `THIRD_PARTY_NOTICES.md` | Protocol, decisions, operational boundaries, and dependency provenance |
| `.github/workflows/ci.yml` | Non-deploying backend, protocol, and macOS build jobs |

## Prerequisites

- **Node.js 24.8.0**, recorded in [.node-version](.node-version), and **npm 11.14.1** match local verification and CI. Select Node with your preferred version manager. In that Node installation, `npm install --global npm@11.14.1 --no-audit --no-fund` selects the CI npm version. The broader `backend/package.json` engine range is not a tested compatibility matrix; use the versions above for the TypeScript stripping/test commands.
- **Xcode 26.5 (17F42), Apple Swift 6.3.2**, full Xcode installed with first-launch setup/license completed. Command Line Tools alone cannot build the app. The app targets macOS 14+, which is distinct from the host OS needed to run Xcode. Older compiler and Intel compatibility are unverified.
- Git and network access for public npm and Swift package downloads. No Cloudflare credentials, remote browser session, model access, Apple Developer membership, or signing certificate is required for the checks below. The app build uses local ad-hoc signing.

The resolved graph includes A2UI-Swift at `4de8e7f84d716be922866113204fd769162dbcbf`, Swift Collections 1.6.0, Swift JSON Schema 0.13.1, and SwiftSyntax 603.0.2. Use the [checked-in resolution](AstraBrowse.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved); A2UI's own tools-version declaration alone does not describe the transitive compiler requirements. Xcode 26.5 was verified with the entire graph.

## Local verification

Run these from the repository root. `DEVELOPER_DIR` selects one installed Xcode for these commands without changing the machine's global selection; adjust the path if needed.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
node --version
npm --version
xcodebuild -version
xcrun swift --version

cd backend
export WRANGLER_SEND_METRICS=false
export WRANGLER_LOG_PATH=.wrangler/logs
export CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false
npm ci --no-audit --no-fund
npm run types -- --check
npm run typecheck
npm test
npm run deploy:dry-run
cd ..

bash script/ci/check-protocol.sh

# Keep build products separate from other contributors and synced source folders.
export ASTRABROWSE_BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/astrabrowse-build.XXXXXX")/DerivedData"
xcodebuild -resolvePackageDependencies \
  -project AstraBrowse.xcodeproj -scheme AstraBrowse \
  -derivedDataPath "$ASTRABROWSE_BUILD_DIR" \
  -onlyUsePackageVersionsFromResolvedFile
bash script/build_and_run.sh --build-only

git diff --check
git diff -- backend/package-lock.json backend/worker-configuration.d.ts \
  AstraBrowse.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
```

`types --check` checks generated declarations without rewriting them. The explicitly named `deploy:dry-run` script compiles and checks the Worker without uploading it; keep `--dry-run` in that script. Do not substitute `npm run deploy`. Bundles are written to ignored `backend/dist`. In restricted environments set `WRANGLER_LOG_PATH` to a writable temporary directory. Native compilation may need access to Xcode/SwiftPM caches and public package hosts; those are local environment requirements, not a reason to configure cloud access. See [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/#deploy).

The protocol script generates temporary responses using the real in-memory TypeScript router and deterministic extractor, then compiles the production Swift `PageBundle`, `PageManifest`, `BackendClient`, and `SSEParser` alongside the verifier. It checks status/ready decoding, fetched manifest/bundle agreement, and content-only refresh with stable specification/recipe revisions. The existing SSE harness also checks LF, CRLF, CR, UTF-8, comments, and multiline data, one byte at a time. The temporary directory is removed on exit. It opens no server port and blocks `fetch` calls.

For an intentional interactive app check, `bash script/build_and_run.sh --verify` builds, launches, and checks that the process is running. The default script also launches the app; those modes first stop any existing AstraBrowse process. Use `--build-only` when another contributor is running the app. Process launch is not visual acceptance: inspect navigation, links, appearance, cache reopening, and the below-top update badge separately. CI does not perform that UI review.

## Fixtures and test changes

`cd backend && npm run dev:fixture` starts an in-memory server on `127.0.0.1:8787`; set `LOCAL_FIXTURE_PORT` to use a different port. It uses hand-authored A2UI and synthetic finance content with the real extractor. It makes no Astra, Browser Run, source-fetch, or R2 requests. Stop it with Control-C; restarting clears its artifacts. Use the app's backend settings to point an intentional manual session at this loopback server.

Keep synthetic content and provenance visibly labeled. `backend/src/demo/finance.ts` generates fictional quotes in 30-second windows; `local-fixture.ts` is a test layout, never a model-generated showcase. A requested public source URL in fixture mode is an identifier; it does not cause that website to be fetched. Protocol checks use `https://example.com/astrabrowse-fixture` only as such an identifier and inject a fixed clock, advancing it by 60 seconds for refresh.

Add regression tests at the changed boundary. Use in-memory artifact storage and injected capture/model/DNS adapters; test invalid output, cancellation, stale publication, and preservation of the last good content when relevant. Keep wire changes synchronized between [TypeScript](backend/src/protocol.ts), [Swift](AstraBrowse/Models/PageBundle.swift), [protocol documentation](docs/protocol.md), and the cross-language check. For renderer/catalog changes, also verify actual rendering and interaction; JSON decoding alone does not exercise the A2UI renderer. Do not add personal data, cookies, credentials, signed Live View URLs, or captured authenticated pages to fixtures or logs.

## Dependency updates

Update dependencies deliberately in an isolated branch or worktree. Read upstream release notes and compiler/runtime requirements before selecting a version. Keep an update focused so behavior changes and dependency changes remain reviewable.

- **npm:** change explicit versions in `backend/package.json` and regenerate `backend/package-lock.json` with the selected npm version. Then run a clean `npm ci` and all backend/protocol checks. Review new install scripts and transitive packages. Preserve the `sharp` override until its upstream replacement is verified; its rationale is in the [backend guide](backend/README.md). Do not use `npm audit fix --force` as a blanket update.
- **Swift:** update the Xcode package requirement and resolve intentionally, then review and include the complete `Package.resolved` change. Run the macOS build and protocol checks with the selected Xcode. Recheck A2UI's catalog, message schema, action handling, and transitive SwiftSyntax/compiler compatibility. Preserve the root and bundled [third-party notices](THIRD_PARTY_NOTICES.md).
- **Toolchains and CI actions:** update `.node-version`, the pinned npm version, or the explicit Xcode path only after local verification and checking the hosted image inventory. Actions are pinned to full commit SHAs with their major version in comments; verify release provenance before replacing a SHA. Update this guide when the verified combination changes.
- **Worker declarations:** after an authorized configuration or Wrangler update, run `npm run types`, review `worker-configuration.d.ts`, then rerun `types --check`, typecheck, tests, and the local dry run. Do not hand-edit generated declarations or enable a cloud binding to make CI pass.

## CI coverage and verification limits

[CI](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. It uses only `contents: read`, disables checkout credential persistence, and cancels superseded runs. There are no deployment actions, release/upload steps, cloud secrets, or signing identities beyond local ad-hoc signing. Dependency caches contain npm download data, not app content.

| Job | Environment | Coverage |
| --- | --- | --- |
| Backend checks | `ubuntu-24.04`, Node 24.8.0, npm 11.14.1 | Clean install, generated-type freshness, TypeScript, backend tests, local Worker bundle, unchanged dependency/generated files |
| Protocol checks | `macos-26`, Xcode 26.5, Node 24.8.0, npm 11.14.1 | Real TypeScript responses decoded by Swift and byte-level SSE framing |
| macOS build | `macos-26`, Xcode 26.5 | Locked Swift resolution, Debug build with ad-hoc signing, unchanged package pins; no app launch |

**Local evidence, September 8, 2026:** clean npm install, generated-type freshness, typecheck, 23 backend tests, local dry-run bundling, protocol/SSE checks, locked Swift resolution, and the macOS build passed. Workflow syntax was checked with `actionlint`; the new shell script passed `bash -n` and `shellcheck`. Verification used an isolated copy of the concurrent integration sources. No CI run or publication was performed.

**Runner requirements still unverified:** actual execution on GitHub, repository Actions policy/available minutes, Ubuntu-specific native npm dependencies, fresh runner package downloads, and runner signing/cache behavior. GitHub's [runner label inventory](https://github.com/actions/runner-images#available-images) maps `macos-26` to Apple silicon, and its [macOS 26 image inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md#xcode) lists `/Applications/Xcode_26.5.app` build 17F42 as of September 8, 2026. Hosted image contents can change; if that explicit path disappears, select and verify a compatible replacement before updating CI. A documentation listing is not a successful hosted build. The pinned [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) v6 actions use Node 24 internally and require Actions runner 2.327.1 or newer; GitHub-hosted execution is the intended environment.

These jobs do not verify real model/browser execution, hosted R2 behavior, full UI acceptance, Intel builds, notarization, distribution, or runtime behavior on the minimum supported macOS version.

## Working together and submitting changes

Check `git status` and the current plan before editing. Preserve concurrent changes; do not reset, clean, stage, or include another contributor's work. Use separate temporary build output and coordinate ownership of shared files. Keep documentation aligned with the integrated code rather than earlier scaffold descriptions.

For a review-ready change, explain the concrete problem and resulting behavior, relevant verification/toolchain results, and any remaining limitations. Preserve the Apache-2.0 license and dependency notices. Publication and merging require their own authorization in this workspace. Current local work does not authorize cloud credentials, deployment, remote model/browser requests, cloud configuration changes, or publication; follow the approval boundary in [planning.md](planning.md).
