# Free hosting plan for review

Approved source repository: `voyageseattle-hash/dj-scorer-taste-guide`. The parent created this empty public target after the first review; source publication awaits the corrected candidate review. The existing GitHub connector identifies the same account; the local GitHub CLI is not authenticated. This preparation has created no hosting service, database account, persistent access grant or credential, and no key has been uploaded.

## Compatible stack

Use a **Render Free Node web service** named `dj-scorer-taste-guide`, serving the built React frontend and Express API together. `render.yaml` prepares the free service with live access disabled. Build with `npm ci --include=dev && npm run build`; start with `npm start`. Node major version 24 is pinned in `.node-version`. `HOST=0.0.0.0` is required; the app accepts Render's actual `RENDER_EXTERNAL_URL` as its origin unless `APP_URL` is explicitly supplied. A static-only host cannot run the current API or MCP/backend code. [Express hosting](https://render.com/docs/deploy-node-express-app), [Node selection](https://render.com/docs/node-version).

Render Free sleeps after 15 idle minutes, may need about a minute to wake, shares 750 service hours per workspace/month, and loses local files across restarts. It cannot attach a persistent disk. Therefore file-budget live mode must stay disabled there. A saved payment method can incur bandwidth/build overages; without one, excess usage suspends service/builds. Verify the actual workspace has no paid plan/add-ons or payment method that could cause charges before deployment. Do not change or risk unrelated sites. [Render Free limits](https://render.com/docs/free).

## Durable global quota on a free host

The prepared alternative is **Neon Free Postgres**, accessed with the standard `pg` driver over verified TLS. Neon's Free tier states no time limit or card requirement; compute/network exhaustion suspends compute and storage-limit violations fail writes. It is preferable to Render Free Postgres's 30-day expiry, which would end before November 16 if created October 15. Actual account state is unverified. Stay on Free, add no card and enable no paid feature. [Neon pricing](https://neon.com/pricing), [Free-limit behavior](https://neon.com/docs/introduction/plans).

After specific approval and secure manual setup, set `QLOO_BUDGET_BACKEND=postgres`, provide `QLOO_BUDGET_DATABASE_URL` through server secret settings, and carry forward `QLOO_PRIOR_HTTP_ATTEMPTS=5`. Never put a connection string in source, client code, command arguments, a public MCP configuration, or a message. Do not use the private prototype's Firebase account as a shortcut.

The counter schema is created by `server/postgresBudget.mjs`. One row per SHA-256 key fingerprint stores `used`, `attempt_cap`, `minute_cap`, `expires_at`, the minute window, and `stopped_code`. It stores no raw API key, query or response. A single atomic conditional `UPDATE ... RETURNING` commits each attempt before the SDK sends it. All HTTP/MCP instances and retries share that row. A restart cannot lower `used`, increase the existing cap, extend expiry, or erase a provider stop. Database failure prevents new dispatch. The local reservation file remains an additional conservative check; it is not the global authority in Postgres mode.

These SQL operations pass actual embedded-Postgres tests for competing transports, restarts, prior-usage carryover, rate windows, expiry, provider stops and storage failure. No external database has been contacted. Do not reset or delete the row to extend an exhausted allowance. The existing five-request approval is exhausted; seeding five used with a cap of five correctly permits zero further calls.

Temporary minute-rate denials return 429 without dispatch and do not permanently disable the same transport; its next invocation consults the authoritative database. Provider and explicit operator stops still persist. File mode also validates and carries prior usage forward, retaining any larger stored count. The public demo remains anonymous: visitors can spend the shared allowance, and cookies/Origin checks are not abuse prevention. Keep the shared allowance bounded and expect live access to stop when it is exhausted.

## External steps still required

1. Parent review of the exact source manifest and archive, followed by the already-approved sanitized MIT publication.
2. Verify existing GitHub/Render account access and no-charge settings. New GitHub app authorization or other persistent access needs specific approval.
3. Obtain approval before creating/accessing a Neon account or persistent database credential. The user enters the database URL and Qloo key directly into protected host settings after approval. [Render secret settings](https://render.com/docs/configure-environment-variables).
4. Obtain a new bounded public Qloo allowance and issuer quota/rate/expiry/hosting information. Neither source publication nor database setup authorizes another Qloo request.
5. Enable live access only after the durable counter is seeded correctly and test the actual public URL within a newly approved request allowance. An offline-only preview must not be presented as live Qloo functionality.
