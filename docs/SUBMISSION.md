# Submission checklist and draft

The proposed public repository is `voyageseattle-hash/dj-scorer-taste-guide`. The candidate is prepared for review, not published or submitted.

## Remaining work

- Review the exact `release-manifest.json`, MIT grant, provenance, and dependency notices; publish only this standalone copy with fresh Git history.
- Verify existing GitHub create/push access and free hosting account access. Obtain a secure handoff if new persistent authorization is necessary.
- Publish a functioning public Node demo on an approved free host. Offline preview alone must not be described as live Qloo functionality.
- Approve a public live request budget and durable quota storage or approved gateway. The earlier five-request test allowance is exhausted. Enter any host secret manually through the host's protected settings after approval.
- Confirm the event key's access period through judging and the applicable quota/rate/hosting terms. Preserve clear provider failures and source labels.
- Test the actual public URL, responsive UI, anonymous choice ownership, and security boundaries. Any further real Qloo request needs new authorization.
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
