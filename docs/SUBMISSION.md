# Submission checklist and draft

The sanitized MIT source is published at [voyageseattle-hash/dj-scorer-taste-guide](https://github.com/voyageseattle-hash/dj-scorer-taste-guide). The operator-approval and Netlify updates are prepared for review and have not been published. No final entry has been submitted by this source preparation.

## Remaining work

- Review the operator-approval diff and exact `release-manifest.json` before updating the public source.
- Verify actual Netlify usage and the database satisfy the owner's no-card/no-spend constraint. Render requested a card and is blocked. The Netlify Function adaptation is prepared for independent review; it is not deployed.
- Publish a functioning public Node demo on an approved free host. Offline preview alone must not be described as live Qloo functionality.
- Configure the approved event path with durable Postgres storage: at most 200 total actual attempts including the five already used, at most 15 per minute, and an expiry no later than 2026-11-17T04:45:00Z. Enter host secrets manually through protected server settings.
- Keep issuer free-access and hosting flags false while unconfirmed. The explicit owner-approved event path permits bounded operation without claiming those facts; an organizer reply is not a prerequisite. Preserve clear provider failures and source labels.
- Test the actual public URL, responsive UI, anonymous choice ownership, and security boundaries within the approved allowance. Preparing this source update makes no further Qloo requests.
- Complete Devpost registration, final text, public repository/license link, public demo URL, and testing instructions. Review the actual final entry before submission.

The official rules set the submission deadline at October 30, 2026, 11:45 p.m. Eastern and judging through November 16. They require a working Qloo-integrated application, public source with an open-source license, a functional demo link, and an explanation of the new work in an existing project. The overview specifically requires an externally published usable demo and says a video is optional. [Rules](https://qloo.devpost.com/rules), [overview](https://qloo.devpost.com/).

## Draft text

**Project name:** DJ Scorer: Taste to Practice

**Short description:** A DJ practice guide that connects a musical direction to culturally related artists and a concrete session plan.

**What it does:** Choose a genre and practice goal, confirm a canonical Qloo music tag, and explore related artists. The workflow can broaden those artists into related genres for discovery or energy-building goals. DJ Scorer then builds a focused exercise with a listening check. When source listings are supplied, a separate matcher explains connections through published genre tags and artist mentions.

**Qloo's role:** Qloo supplies cultural relationships through the public `@qloo/qloo-harness` SDK. The application retains confirmed identifiers across stages, bounds requests, and labels the difference between provider data and its own planning rules. An explicit invented example demonstrates the flow without making provider requests.

**Agent interface:** A local MCP server exposes readiness, music-tag search, confirmed-tag planning, and offline preview to existing agents. These schema-validated tools invoke the same route factory as the web interface and orchestrate Qloo operations according to the goal. No LLM is invoked; the practice steps are deterministic. Protocol-level tests use a real MCP client with fixture responses.

**Built with:** TypeScript, JavaScript, Node.js, Express, React, Vite, Qloo, Model Context Protocol, Zod. Do not add Gemini, Firebase or Stripe tags for this focused copy.

**What was built during the event:** DJ Scorer began as a largely unused prototype. The Qloo module, its interface, workflow, budgeting, and tests were added October 13–14, 2026. Live compatibility fixes and this independent submission copy followed October 15. The submission does not claim that the entire earlier app was created during the event.

**Validation and limitations:** A bounded local test used exactly five requests and finished with one selectable music tag, four artists, and a three-step plan. The independently runnable public copy excludes private accounts, payments, recordings, and datasets. Its offline example is fictional; live hosting and expanded artist-tag validation must be described according to the actual final demo state.
