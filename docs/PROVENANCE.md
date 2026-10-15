# Work chronology and source scope

DJ Scorer existed as a largely unused prototype before this hackathon work. The submission must describe a substantial new module, not an entirely new application.

The original prototype's exact start date is unknown. A migration or commit date must not be substituted for that date in Devpost.

| Period | Work |
| --- | --- |
| Before the new Qloo work | Existing DJ practice/community prototype and earlier app infrastructure. |
| October 13–14, 2026 | New taste-guide UI; canonical tag confirmation; public Qloo SDK adapter; artist recommendations; optional tag expansion; local listing matcher; practice planner; explicit invented offline example; request budgeting and private-file protections. |
| October 15, 2026 | Five-request live validation; fixed over-specific tag search and documented entity type/subtype parsing; added transport-cap regressions; prepared this standalone sanitized copy and a genuine MCP interface for existing agent clients. |

The extraction reuses only the focused taste module and shared region/type utilities. It adds an anonymous demo-session adapter, focused build/server wrapper, public documentation, and retained dependency notices. It excludes original Git history, Firebase identifiers, profiles, community writes, payments, media/recording features, real event caches, local artifacts, and secrets. No Qloo response payloads are bundled.

The five real requests all returned HTTP 200. The first search exposed an over-specific query; the next two requests exposed artist filtering that ignored the `subtype` field. The final two requests passed after both fixes. All five remain counted. The check used an isolated local identity injection; it did not validate the private app's browser sign-in or production hosting.
