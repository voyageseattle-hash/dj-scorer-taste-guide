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

The production command serves the built frontend and Express API together. The Netlify alternative in `netlify.toml` serves `dist/` statically and adapts the same Express routes through a Function. A static-only deployment cannot run the live API. No Firebase project, payment account, FFmpeg installation, recordings, or external data cache is needed.

## Live configuration

Live mode is disabled by default. No key or Qloo response dataset is included. Configure only the fields in `.env.example`, in your own ignored `.env` or the hosting provider's server secret store. The operator enters credentials directly; never put a key in a `VITE_` variable.

Access supports either documented issuer confirmations or the explicit, bounded event-demo approval below. `QLOO_FREE_ACCESS_CONFIRMED` and `QLOO_HOSTING_PERMITTED_CONFIRMED` describe issuer facts: leave them false unless actually confirmed. They are not a prerequisite for the separately approved event path. That path exposes the unconfirmed facts in the status response and visible UI; it does not establish vendor terms or a vendor quota.

For the owner's approved event demo, these are **operator settings**, including the already-used five requests:

```dotenv
QLOO_EVENT_DEMO_OPERATOR_APPROVED=true
QLOO_OPERATOR_APPROVED=true
QLOO_FREE_ACCESS_CONFIRMED=false
QLOO_HOSTING_PERMITTED_CONFIRMED=false
QLOO_EVENT_QUOTA=200
QLOO_EVENT_RATE_PER_MINUTE=15
QLOO_ACCESS_EXPIRES_AT=2026-11-17T04:45:00Z
QLOO_PRIOR_HTTP_ATTEMPTS=5
QLOO_BUDGET_BACKEND=postgres
QLOO_ENABLED=false
```

Supply `QLOO_API_KEY` and `QLOO_BUDGET_DATABASE_URL` only through protected server settings. Keep `QLOO_ENABLED=false` until the reviewed build and durable database are ready. Enabling the event path requires both approval flags, a key, Postgres, at least five prior attempts, a cap no larger than 200, a rate no larger than 15, and a future expiry no later than the stated stop time. The five prior attempts leave at most 195 additional actual HTTP attempts, including retries. The issuer's actual limits remain unknown; local limits are not a promise of free provider service.

`QLOO_ENABLED=true` also requires `QLOO_OPERATOR_APPROVED=true` and the access prerequisites. File-budget mode requires a durable `data/` mount in production and permits at most the lesser of five attempts and the configured quota. It validates `QLOO_PRIOR_HTTP_ATTEMPTS` and persists the larger of prior and stored usage before enabling dispatch. For an ephemeral free host, `QLOO_BUDGET_BACKEND=postgres` uses an atomic shared Postgres counter with the documented operator cap (hard ceiling 200), global minute rate, expiry, and provider-stop state. Every retry reserves an attempt before dispatch. A temporary shared minute-rate denial returns 429 and later calls consult the database again; provider and explicit stops remain fail-closed. Database failure prevents dispatch. Restarting cannot reset usage, raise an existing cap, clear a stop, or extend expiry. Set `QLOO_PRIOR_HTTP_ATTEMPTS=5` for the key already tested; a cap of five then permits no additional calls. A new public budget requires separate approval, never deletion or reset of the counter.

The original local validation used exactly five requests in total. Its final House search returned a selectable music tag and four artists, with a three-step practice plan. The standalone extraction has only been tested offline. The owner subsequently approved the bounded public event demo described above; preparing this path makes no additional Qloo requests. Public operation still requires a verified no-charge host, durable storage, and secure manual secret entry. No database account or credential has been created by preparing this copy.

Anonymous, short-lived server sessions keep tag choices tied to the browser that requested them. In Postgres mode, sessions and server-issued canonical choices survive function cold starts and parallel instances. They expire after 20 minutes and expired records are removed on later writes. Only a session UUID, choice UUID, canonical tag fields and expiry are stored for this binding; arbitrary client-supplied provider identifiers are rejected. These UUIDs are not sent to Qloo. The public copy does not use the private prototype's authentication or community database. Full API responses are not cached, and no recordings, names, email addresses, or account profiles are sent to Qloo.

## Netlify preparation

The function build uses Node 24 and `serverless-http` 4.0.0. The build command stamps only Netlify's nonsecret build context into the server bundle. Live mode requires a production build plus the explicit event approval and Postgres; preview builds cannot enable it. The function uses no local usage file. Neon/Postgres remains the authority for every actual HTTP attempt, with an additional conservative in-memory workflow reservation limit per instance. Local HTTP and stdio MCP entrypoints remain available.

After independent review and verification of actual hosting usage, enter the key and database URL manually in Netlify's protected **Functions** environment settings, scoped to **Production**. Set the nonsecret event preset above in that same runtime scope; leave live disabled until ready. Netlify configuration-file environment settings do not populate Functions runtime secrets. `URL` supplies the normal site origin; set `APP_URL` only if needed for the actual public origin. No deployment, billing change or live validation is performed by this source preparation. See [hosting](docs/HOSTING.md).

## Scope and limits

- This copy contains only the taste workflow, focused UI, fixtures, security controls, and tests listed in `release-manifest.json`.
- Live event matching has no bundled real listings. The explicit offline example demonstrates it with fictional venues.
- Practice instructions are rule-based product interpretations. The workflow uses Qloo's public SDK and exposes it through MCP tools; it does not claim an LLM generated these instructions or evaluated the DJ's skill.
- Aggregate affinities are neither individual preference probabilities nor attendance forecasts.
- The public demo is anonymous: visitors can consume its shared allowance. Cookies bind choices and Origin checks constrain browser cross-site requests; they do not prevent scripted callers or allowance-exhaustion attacks. The bounded shared counter is the spending boundary.
- The expanded artist-tag branch passes SDK mock tests but was not included in the final bounded live check.

See [hosting](docs/HOSTING.md), [submission checklist](docs/SUBMISSION.md), and [third-party notices](THIRD_PARTY_NOTICES.md). Project code is MIT licensed. Dependencies retain their own licenses; Qloo access and data rights remain governed by their service terms.
