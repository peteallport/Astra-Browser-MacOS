 <img width="100 " height="100" alt="image" src="https://github.com/user-attachments/assets/22d1da28-e776-4f29-a512-4ce3aa2c2f29" />
 
# AstraBrowse for macOS

A browser that transforms web pages into beautifully designed native interfaces.

**🚫 No Invasive Ads · <img src="design/cookie-free.png" width="18" /> Cookie Banner Free · 📉 Memory Efficient · ⚡ Fast ·** 

**🪄 Clean + Consistent UI/UX (DOM → Native UI) · 🔓 Open Source (Apache 2.0)**

[<img width="1020" height="655" alt="image" src="https://github.com/user-attachments/assets/3425a08f-647e-48b2-854a-ef6d25e71137" />](https://www.youtube.com/embed/iOUCUWxhbsg?si=6MiM_eEzMn_hp-Uj)


**Start with [planning.md](planning.md), the source of truth for the approved product, research, decisions, and current implementation boundary.**

## Vision

Astra interprets a page's DOM, extracts its meaningful content and interactions, and presents them through native components. The aim is to remove ads, cookie banners, and visual clutter while preserving what people came to read and do.

The goal is a faster, lighter browsing experience where the client receives structured content instead of entire web page bundles. Content should update automatically as the source changes, eliminating manual refresh while preserving the reader's place.

News articles and feeds are potential first demonstrations of a broader idea: making the web feel as responsive and coherent as a native app.

## Intended experience

- Beautiful native macOS interfaces shaped around meaningful content.
- Content and interactions extracted from the source DOM.
- Structured content delivered to the client.
- Ads, cookie banners, and visual clutter removed from the native presentation.
- Automatic updates that preserve reading position and interaction state.

## Current status

The macOS app builds with the pinned A2UI-Swift renderer, streaming backend client, local cache, filtering, and native update handling. The TypeScript backend implements bounded capture/compilation adapters, immutable artifacts, conditional manifests, and revalidation. The shared wire format is documented in [docs/protocol.md](docs/protocol.md).

The backend is deployed at [astrabrowse-backend.quirk.workers.dev](https://astrabrowse-backend.quirk.workers.dev), with private R2 storage and AI Gateway. **Finance and Hacker News reopen from validated shared snapshots, and a fresh Wikipedia conversion completed in 42.7 seconds and rendered in the macOS app.** That run verified current Astra access, source capture, and artifact publication. The stream/browser reliability fixes are deployed. Post-deployment Wikipedia cache delivery and artifact validation pass; fresh capture currently receives Browser Run HTTP 429 on the account's Workers Free plan. The earlier finance changing-content assertion also remains unresolved. See [planning.md](planning.md) and [verification evidence](docs/local-verification.md).

**Authorized cloud scope:** Peter approved the listed resources, production configuration and deployment, one bounded live conversion, and one revalidation on September 8. That approval remains in force for this integration. Additional resource changes or operations beyond the approved scope require separate confirmation; see the [activation record](docs/cloud-change-proposal.md).

## Run the macOS app

Open [AstraBrowse.xcodeproj](AstraBrowse.xcodeproj) in Xcode, or run:

```sh
./script/build_and_run.sh
```

Command-T opens a tab; Command-L focuses the address field. The Codex Run action uses the same script. It builds with local ad-hoc signing, so an Apple Developer membership is not required. The resolved Swift packages require Swift 6.2 or newer. The deployment target is macOS 14+.

Build products go to temporary DerivedData outside the source checkout. `ASTRABROWSE_BUILD_DIR` overrides that location. This script does not produce a notarized distribution package.

## Backend development

Use Node.js 24 or newer:

```sh
cd backend
npm ci
npm run typecheck
npm test
npm run deploy:dry-run
npm run dev
```

For a completely local native/API check, run `npm run dev:fixture` **instead of** `npm run dev`. In the app’s Backend Settings, use `http://localhost:8787`, then enter a public HTTPS URL. The server returns a prominently labeled hand-authored fixture with simulated finance quotes; it does not fetch or convert that website. The fixture exercises the real extraction, validation, caching, and content-delivery contracts without cloud access.

The health endpoint is `/health`. A healthy process does not establish successful model generation. Default local development remains cloud-disabled; the approved `production` environment enables cloud bindings. `npm run deploy` and `npm run deploy:dry-run` target that production environment, with only the former making a deployment.

Use the [backend setup guide](backend/README.md) and [local configuration example](backend/.dev.vars.example) for Cloudflare resources and settings. Keep credentials in ignored local secret files or Cloudflare secrets, never in the Mac app or source control. No cloud resources are provisioned merely by checking out this repository or running a deployment dry run.

The intended hosted deployment uses a Worker, Browser Run, R2, and AI Gateway's OpenAI Responses route. The planning document maps these to generic HTTP, Chromium/CDP, object storage, and model-provider interfaces for future alternative infrastructure adapters.

## License

Client and backend code use [Apache-2.0](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md). Source website content retains its own provenance and rights.

## GPT-6 Astra Hackathon SF

**Event date:** Tuesday, September 8, 2026.

**Source:** [Official participant guide](https://cerebralvalley.ai/e/openai-gpt-6-astra-sf/details).

**Last verified:** September 8, 2026.

This reference summarizes the participant guide. The guide and organizer announcements remain the source for event updates.

### 1. Event objective

Build something novel and useful that demonstrates GPT-6 Astra's new capabilities. Entries may be new projects or new features for an existing startup. Judges assess both how the team uses Astra during development and how Astra contributes to the resulting product.

### 2. Venue and arrival

**Venue:** OpenAI, 1515 3rd Street, San Francisco, CA 94158.

- Visitly sends a separate pre-registration email containing the event's required NDA and media release.
- Completing Visitly pre-registration provides a unique arrival QR code.
- Present that QR code and a government-issued photo ID to the OpenAI team in the lobby.
- Wi-Fi access details are available in the [participant guide's Getting Ready section](https://cerebralvalley.ai/e/openai-gpt-6-astra-sf/details#2-getting-ready-2). Network credentials are intentionally omitted from this repository.

### 3. Community and teams

Join the [OpenAI GPT-6 Astra SF Hackathon Discord](https://discord.com/invite/hBrgZank9S) for team formation, participant discussion, and official updates. Introduce your skills and project interests in `#intros`; use `#team-search` to find collaborators. Teams may have at most four members, and solo participation is permitted.

| Channel | Purpose |
| --- | --- |
| `#general` | Meet and talk with other participants. |
| `#rules` | Registration, building, and pitching rules for the event. |
| `#announcements` | Official organizer updates and reminders. |
| `#intros` | Introduce yourself, your skills, and your project interests. |
| `#team-search` | Find teammates, subject to the four-person team limit. |
| `#questions` | Ask general event questions; mention `@CV` for the Cerebral Valley team. |

### 4. Schedule

All times below are for September 8, 2026, in San Francisco local time (Pacific Daylight Time, UTC−7).

| Time | Activity |
| --- | --- |
| 9:00 AM | Doors open and check-in begins. |
| 10:00 AM | Welcome and kickoff. |
| 10:30 AM | Hacking starts. |
| 12:00 PM | Lunch. |
| **5:30 PM** | **Submissions due; dinner.** |
| 7:00 PM | Finalist demos, according to the schedule overview. |
| 7:45 PM | Judging and awards. |
| 8:00 PM | Reception. |
| 9:00 PM | Doors close. |

**Unresolved timing discrepancy:** The guide's schedule overview lists finalist demos at **7:00 PM**, while its judging section says selected teams present at **6:45 PM**. Both times are recorded here; confirm the final timing through organizer announcements.

### 5. Rules and prohibited projects

- **Public repository:** The project repository must be publicly accessible. A feature added to an existing startup must be placed in an isolated repository that can be shared publicly.
- **Team size:** A maximum of four people per team; solo entries are allowed.
- **Work shown in the demo:** Highlight only the features, code, and functionality created during the hackathon. Make those original contributions clear to the judges; failing to identify them results in immediate disqualification.
- **Rights and conduct:** Projects that violate legal, ethical, or platform policies, or use code, data, or assets without the necessary rights, are disqualified.

The guide explicitly prohibits the following project categories:

- AI mental-health advisors.
- Basic retrieval-augmented generation (RAG) applications.
- Basic Streamlit applications.
- Image analyzers.
- AI education chatbots.
- AI job-application screeners.
- AI nutrition coaches.
- Personality analyzers.
- Any project that uses AI to generate and provide medical advice.
- Any project whose main feature is a dashboard.
- Sports analyzers or coaches.

### 6. OpenAI resources and participant benefits

| Resource | Link or details |
| --- | --- |
| Codex app | [Download and access Codex](https://chatgpt.com/codex/) |
| Model guidance | [Latest-model features, best practices, and migration guidance](https://developers.openai.com/api/docs/guides/latest-model) |
| Migration quickstart | [GPT-6 Astra migration quickstart](https://developers.openai.com/api/docs/guides/latest-model#gpt-6-astra-migration-quickstart) |
| Complimentary subscription | One month of ChatGPT Pro Lite. |
| API credits | $100 in OpenAI API credits. |

After event check-in, the Cerebral Valley team sends benefit-access links to the email address used to register. This describes the event benefit; it does not confirm that any particular participant has received or redeemed it.

### 7. Submission

Submit through the [Cerebral Valley submission page](https://cerebralvalley.ai/e/openai-gpt-6-astra-sf/hackathon/submit) by **5:30 PM on September 8, 2026**.

The submission requires a **one-minute demo video** showing the specific features, code, and functionality built during the hackathon. Before submitting, verify that:

- The repository is public.
- The demo link is accessible to reviewers.
- All team members are included on the submission page.
- The demo clearly distinguishes work created during the event.

### 8. Judging and finalist demos

After submissions close, OpenAI judges review entries and select **five finalists**, considering usefulness, creativity, interest, and technical ambition. Finalists demonstrate their projects on stage to the attendees, with **three minutes for a live demo** followed by **two minutes of judge Q&A**. The guide gives conflicting stage-start times; see the schedule note above.

The four judging categories each carry **25%** of the score:

| Category | Weight | What judges assess |
| --- | --- | --- |
| GPT-6 Astra in Development | 25% | How the team worked with Astra to build the project and effectively used its new capabilities. |
| GPT-6 Astra in Project | 25% | Astra's role inside the product, including novel uses and capabilities enabled by the model. |
| Live Demo | 25% | Novelty, demonstration quality, and how compelling the working project is to watch. Show an actual demo, rather than only a presentation or Figma design. |
| Technicality | 25% | Implementation quality, technical sophistication, and sound engineering. |

After the finalist presentations, judges deliberate and choose the top three winners for the awards ceremony.

### 9. Prizes

| Award | Prize |
| --- | --- |
| First place | $50,000 in credits plus DevDay 2026 tickets. |
| Second place | $25,000 in credits. |
| Third place | $15,000 in credits. |
| All finalists | One year of ChatGPT Pro. |
