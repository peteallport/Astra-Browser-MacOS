# AstraBrowse

A native macOS browser concept that turns public websites into Astra-generated interfaces, with a reusable UI specification, separate source content, and local caching.

**Start with [planning.md](planning.md), the source of truth for the approved product, research, decisions, and current implementation boundary.**

## Current status

The SwiftUI browser shell builds and runs. It provides a sidebar, tabs, address entry, and placeholder content. The backend contains infrastructure scaffolding only: Worker configuration, Browser Run/R2/rate-limit bindings, gateway settings, and a health endpoint.

Website conversion, Astra calls, Live View, the native JSON renderer, content caching, refresh delivery, and Yehoooo! Finance are planned features. They are not implemented by this scaffold. Pete has paused feature implementation after infrastructure and documentation.

## Run the macOS shell

Open [AstraBrowse.xcodeproj](AstraBrowse.xcodeproj) in Xcode, or run:

```sh
./script/build_and_run.sh
```

Command-T opens a tab; Command-L focuses the address field. The Codex Run action uses the same script. It builds with local ad-hoc signing, so an Apple Developer membership is not required. The verified toolchain is Xcode 27.0 beta; the deployment target is macOS 14+.

Build products go to temporary DerivedData to avoid signing issues from synced-folder metadata. `ASTRABROWSE_BUILD_DIR` overrides that location. This script does not produce a notarized distribution package.

## Backend infrastructure

Use Node.js 22 or newer:

```sh
cd backend
npm ci
npm run types
npm run typecheck
npm run deploy:dry-run
npm run dev
```

The health endpoint is `/health`. A successful health response verifies the scaffold process, not a working browser, model call, or storage integration. The app is not connected to this endpoint yet.

Use the [backend setup guide](backend/README.md) and [local configuration example](backend/.dev.vars.example) for Cloudflare resources and settings. Keep credentials in ignored local secret files or Cloudflare secrets, never in the Mac app or source control. No cloud resources are provisioned merely by checking out this repository or running a deployment dry run.

The intended hosted deployment uses a Worker, Browser Run, R2, and AI Gateway's OpenAI Responses route. The planning document maps these to generic HTTP, Chromium/CDP, object storage, and model-provider interfaces for future alternative infrastructure adapters.

## License

Client and backend code use [Apache-2.0](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md). Source website content retains its own provenance and rights.
