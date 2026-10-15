# Hosting status and requirements

The sanitized MIT source is published at [voyageseattle-hash/dj-scorer-taste-guide](https://github.com/voyageseattle-hash/dj-scorer-taste-guide). The subsequent operator-approval and Netlify adaptation are prepared for review and are not yet published. This preparation has created no hosting service, database account, persistent access grant or credential, and no key has been uploaded.

## Compatible stack

The current app serves the built React frontend and Express API together. Build with `npm ci --include=dev && npm run build`; start with `npm start`. Node major version 24 is pinned in `.node-version`. `HOST=0.0.0.0` and the actual public `APP_URL` are required on a conventional Node host. A static-only host cannot run the current API or MCP/backend code.

`render.yaml` is a disabled reference configuration. The actual Render setup prompted for a payment method and a $1 authorization, contrary to the owner's constraint. Do not proceed there. The owner approved Netlify as the fallback; actual remaining usage is being checked separately. This source work does not authorize any billing, recharge or unrelated-site change.

`netlify.toml` prepares the static React output plus an Express Function using the MIT `serverless-http` adapter. The API, health and about routes rewrite to that Function. The build pins Node 24 and stamps only Netlify's nonsecret build context into the server bundle; live mode refuses nonproduction builds. `CONTEXT` is not assumed to exist at runtime. Set secret/runtime variables through the UI's Functions scope, Production context, rather than in `netlify.toml`. The function reads `URL` as its expected site origin unless `APP_URL` is supplied. [Express on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/express/), [Runtime environment settings](https://docs.netlify.com/build/functions/environment-variables/).

The session and canonical-choice implementation uses the same Postgres pool as the request budget. Server-issued UUIDs and canonical tag fields persist across cold starts and parallel instances; planning accepts only an unexpired choice belonging to the unexpired session. Provider inputs cannot be supplied through client JSON. Records expire after 20 minutes and are cleaned up on later writes. No signing secret is required. Database failures return a redacted error and do not fall back to local state. Live Netlify mode never writes a local usage file. Local HTTP/MCP offline mode can still use memory state.

The stdio MCP entrypoint is preserved as a separate local process, sharing the same route factory and Postgres controls when configured. It is not described as a public HTTP MCP endpoint. Source tests use actual embedded Postgres SQL and multiple independent Function handlers. No hosted database or Qloo request is used by these tests.

The adapter uses Netlify's documented Lambda-compatible handler shape. That mode is supported during this event but is deprecated for new deploys from July 1, 2027; migrate to the modern Functions API before reuse beyond that date. The event access expiry is earlier. The packaged Node 24 artifact is tested locally; actual Linux hosting, database connectivity and live latency still require deployment validation after review. [Lambda compatibility](https://docs.netlify.com/build/functions/lambda-compatibility/), [Function configuration](https://docs.netlify.com/build/functions/configuration/).

## Durable global quota

The prepared alternative is **Neon Free Postgres**, accessed with the standard `pg` driver over verified TLS. Neon's Free tier states no time limit or card requirement; compute/network exhaustion suspends compute and storage-limit violations fail writes. It is preferable to Render Free Postgres's 30-day expiry, which would end before November 16 if created October 15. Actual account state is unverified. Stay on Free, add no card and enable no paid feature. [Neon pricing](https://neon.com/pricing), [Free-limit behavior](https://neon.com/docs/introduction/plans).

After secure manual setup on an approved no-charge plan, set `QLOO_BUDGET_BACKEND=postgres`, provide `QLOO_BUDGET_DATABASE_URL` through server secret settings, and carry forward `QLOO_PRIOR_HTTP_ATTEMPTS=5`. Never put a connection string in source, client code, command arguments, a public MCP configuration, or a message. Do not use the private prototype's Firebase account as a shortcut.

The counter schema is created by `server/postgresBudget.mjs`. One row per SHA-256 key fingerprint stores `used`, `attempt_cap`, `minute_cap`, `expires_at`, the minute window, and `stopped_code`. It stores no raw API key, query or response. A single atomic conditional `UPDATE ... RETURNING` commits each attempt before the SDK sends it. All HTTP/MCP instances and retries share that row. A restart cannot lower `used`, increase the existing cap, extend expiry, or erase a provider stop. Database failure prevents new dispatch. An additional conservative workflow reservation guard runs in memory in Postgres mode; its reset cannot weaken the global actual-attempt counter.

These SQL operations pass actual embedded-Postgres tests for competing transports, restarts, prior-usage carryover, rate windows, expiry, provider stops and storage failure. No external database has been contacted. Do not reset or delete the row to extend an exhausted allowance. The original five-request test allowance was exhausted. The subsequently approved public event path uses at most 200 total actual HTTP attempts, including those five, at most 15 per minute, and stops no later than November 17, 2026 at 04:45 UTC. Lower stored limits still prevail. These are operator bounds, not confirmed provider limits.

Temporary minute-rate denials return 429 without dispatch and do not permanently disable the same transport; its next invocation consults the authoritative database. Provider and explicit operator stops still persist. File mode also validates and carries prior usage forward, retaining any larger stored count. The public demo remains anonymous: visitors can spend the shared allowance, and cookies/Origin checks are not abuse prevention. Keep the shared allowance bounded and expect live access to stop when it is exhausted.

## External steps still required

1. Independently review the unpublished operator-approval and Netlify changes before updating source or deploying.
2. Verify a compatible existing host and database plan satisfy the owner's no-card/no-spend constraint. Resolve runtime compatibility before deployment. Do not proceed with the blocked Render setup or change unrelated sites.
3. The user enters the database URL and Qloo key directly into protected server settings. Complete any required account access within the owner's authorization.
4. Use the explicit event-demo approval path documented in the README. Leave issuer flags false while those facts remain unconfirmed; an organizer reply is not a prerequisite for this approved path. Stop if a known prohibition or unavoidable charge is established.
5. Enable live access only after the durable counter carries prior usage forward. Validate the actual public URL within the approved allowance. An offline-only preview must not be presented as live Qloo functionality.
