# DJ Scorer: Taste guide

Turn a musical direction into artist exploration and a focused practice session. Choose a genre, confirm a canonical Qloo music tag, and generate a plan. Qloo supplies aggregate cultural relationships; DJ Scorer turns them into exercises. Discovery and energy goals optionally expand artists into related music tags. Scene matching operates on supplied listing tags and artist mentions, without claiming that an artist's performance is verified.

This is a focused, independently runnable extraction from a pre-existing DJ Scorer prototype. The Qloo module was added October 13–14, 2026. Live adapter fixes and this extraction followed October 15. It is not a claim that the entire earlier app was created during the hackathon. See [provenance](docs/PROVENANCE.md).

An included MCP server exposes readiness, tag search, confirmed-tag planning, and offline preview to existing agents. This is a real callable tool interface, with protocol-level fixture tests; it does not require or run an LLM. See [the agent interface](docs/AGENT_INTERFACE.md).

## Run

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The **Try offline example** button works without an account or credentials. Its artists, affinities, and venues are explicitly invented. It never substitutes for failed live calls.

```sh
npm test
npm run lint
npm run build
npm start
```

The production command serves the built frontend and Express API together. A static-only deployment cannot run the live API. No Firebase project, payment account, FFmpeg installation, recordings, or external data cache is needed.

## Live configuration

Live mode is disabled by default. No key or Qloo response dataset is included. Configure only the fields in `.env.example`, in your own ignored `.env` or the hosting provider's server secret store. Never put a key in a `VITE_` variable. Obtain documented issuer limits, precise expiry, free access, hosting permission, and operator approval before enabling a public demo.

`QLOO_ENABLED=true` also requires `QLOO_OPERATOR_APPROVED=true` and the access prerequisites. File-budget mode requires a durable `data/` mount in production and permits at most the lesser of five attempts and the configured quota. It validates `QLOO_PRIOR_HTTP_ATTEMPTS` and persists the larger of prior and stored usage before enabling dispatch. For an ephemeral free host, `QLOO_BUDGET_BACKEND=postgres` uses an atomic shared Postgres counter with the documented operator cap (hard ceiling 200), global minute rate, expiry, and provider-stop state. Every retry reserves an attempt before dispatch. A temporary shared minute-rate denial returns 429 and later calls consult the database again; provider and explicit stops remain fail-closed. Database failure prevents dispatch. Restarting cannot reset usage, raise an existing cap, clear a stop, or extend expiry. Set `QLOO_PRIOR_HTTP_ATTEMPTS=5` for the key already tested; a cap of five then permits no additional calls. A new public budget requires separate approval, never deletion or reset of the counter.

The original local validation used exactly five requests in total. Its final House search returned a selectable music tag and four artists, with a three-step practice plan. The standalone extraction has only been tested offline; deploying it does not authorize further use of that credential. Public live operation needs a separately approved budget, durable storage, and secure secret handoff. No database account or credential has been created by preparing this copy.

Anonymous, short-lived server sessions keep tag choices tied to the browser that requested them. Their identifiers stay local and are not sent to Qloo. The public copy does not use the private prototype's authentication or community database. API responses are not cached, and no recordings, names, email addresses, or account profiles are sent to Qloo.

## Scope and limits

- This copy contains only the taste workflow, focused UI, fixtures, security controls, and tests listed in `release-manifest.json`.
- Live event matching has no bundled real listings. The explicit offline example demonstrates it with fictional venues.
- Practice instructions are rule-based product interpretations. The workflow uses Qloo's public SDK and exposes it through MCP tools; it does not claim an LLM generated these instructions or evaluated the DJ's skill.
- Aggregate affinities are neither individual preference probabilities nor attendance forecasts.
- The public demo is anonymous: visitors can consume its shared allowance. Cookies bind choices and Origin checks constrain browser cross-site requests; they do not prevent scripted callers or allowance-exhaustion attacks. The bounded shared counter is the spending boundary.
- The expanded artist-tag branch passes SDK mock tests but was not included in the final bounded live check.

See [hosting](docs/HOSTING.md), [submission checklist](docs/SUBMISSION.md), and [third-party notices](THIRD_PARTY_NOTICES.md). Project code is MIT licensed. Dependencies retain their own licenses; Qloo access and data rights remain governed by their service terms.
