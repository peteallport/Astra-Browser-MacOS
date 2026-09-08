# Third-party notices

AstraBrowse project source is licensed under the [Apache License, Version 2.0](LICENSE). The root license text is an unchanged copy of the [Apache Software Foundation's official text](https://www.apache.org/licenses/LICENSE-2.0.txt). Third-party software and website content retain their own licenses and ownership.

## Native scaffold

The native scaffold uses Apple's SwiftUI, Foundation, and Observation system frameworks. Inspection found no third-party Swift package dependencies, vendored third-party source, or bundled third-party media assets in the native app.

## Planned format inspiration

[Vercel json-render](https://github.com/vercel-labs/json-render) informs the proposed UI specification format in the planning document. Its upstream [license](https://github.com/vercel-labs/json-render/blob/main/LICENSE) is Apache-2.0. This is attribution for planned format inspiration: no json-render package or copied implementation is currently included in the scaffold, and no compatibility claim is made.

## Backend tooling

The scaffold declares the following development dependencies. Versions and licenses were verified against installed package metadata; exact dependency resolution is recorded in [package-lock.json](backend/package-lock.json).

| Package | Version | Upstream license |
| --- | --- | --- |
| Wrangler | 4.129.0 | MIT OR Apache-2.0 |
| TypeScript | 7.0.2 | Apache-2.0 |
| @types/node | 24.13.3 | MIT |

The generated [Worker type declarations](backend/worker-configuration.d.ts) retain their Cloudflare and Microsoft copyright notices and Apache-2.0 license header.

The transitive `sharp` dependency is pinned to 0.35.4 through an override; its installed package declares Apache-2.0. This file is not an exhaustive transitive-license inventory. Preserve applicable upstream license and notice files when redistributing dependencies or future bundled artifacts. Installed dependencies and generated deployment bundles are excluded from source control.

## Website content

The project license does not relicense content obtained from websites. Any future cached text, images, media, or other source content retains its original ownership and applicable attribution requirements.
