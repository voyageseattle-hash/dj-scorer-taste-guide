import { TasteServiceError } from "./qlooAccess.ts";

export const BUDGET_SCHEMA = `CREATE TABLE IF NOT EXISTS qloo_http_budget (
  key_hash TEXT PRIMARY KEY CHECK (length(key_hash) = 64),
  used INTEGER NOT NULL CHECK (used >= 0),
  attempt_cap INTEGER NOT NULL CHECK (attempt_cap > 0),
  minute_cap INTEGER NOT NULL CHECK (minute_cap > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  window_used INTEGER NOT NULL DEFAULT 0,
  stopped_code TEXT
)`;

export async function createPostgresBudget(database, keyHash, { cap, rate, expiresAt, priorUsed }) {
  if (!/^[a-f0-9]{64}$/.test(keyHash) ||
      !Number.isInteger(cap) || cap < 1 || cap > 200 ||
      !Number.isInteger(rate) || rate < 1 || rate > 30 ||
      !Number.isInteger(priorUsed) || priorUsed < 0 || priorUsed > 1e9 ||
      !Number.isFinite(Date.parse(expiresAt))) throw new Error("INVALID_SHARED_BUDGET_CONFIG");
  await database.query(BUDGET_SCHEMA);
  // Restarting may tighten limits or carry prior usage forward. It cannot
  // raise an existing cap, erase usage, extend expiry, or clear a stop flag.
  await database.query(`INSERT INTO qloo_http_budget
    (key_hash, used, attempt_cap, minute_cap, expires_at) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (key_hash) DO UPDATE SET
      used = GREATEST(qloo_http_budget.used, EXCLUDED.used),
      attempt_cap = LEAST(qloo_http_budget.attempt_cap, EXCLUDED.attempt_cap),
      minute_cap = LEAST(qloo_http_budget.minute_cap, EXCLUDED.minute_cap),
      expires_at = LEAST(qloo_http_budget.expires_at, EXCLUDED.expires_at)`,
    [keyHash, priorUsed, cap, rate, expiresAt]);
  return {
    async reserve() {
      let result;
      try {
        // One atomic UPDATE is the authority for every instance and SDK retry.
        // The committed reservation precedes the outbound HTTP dispatch.
        result = await database.query(`UPDATE qloo_http_budget SET
          used = used + 1,
          window_used = CASE WHEN window_started_at <= CURRENT_TIMESTAMP - INTERVAL '60 seconds' THEN 1 ELSE window_used + 1 END,
          window_started_at = CASE WHEN window_started_at <= CURRENT_TIMESTAMP - INTERVAL '60 seconds' THEN CURRENT_TIMESTAMP ELSE window_started_at END
          WHERE key_hash = $1 AND stopped_code IS NULL AND expires_at > CURRENT_TIMESTAMP
          AND used < attempt_cap
          AND (window_started_at <= CURRENT_TIMESTAMP - INTERVAL '60 seconds' OR window_used < minute_cap)
          RETURNING used`, [keyHash]);
        if (!result.rows.length) {
          const denial = (await database.query(`SELECT stopped_code,
            expires_at <= CURRENT_TIMESTAMP AS expired,
            used >= attempt_cap AS exhausted,
            window_started_at > CURRENT_TIMESTAMP - INTERVAL '60 seconds' AND window_used >= minute_cap AS rate_limited,
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_started_at + INTERVAL '60 seconds' - CURRENT_TIMESTAMP))))::INTEGER AS retry_after_seconds
            FROM qloo_http_budget WHERE key_hash = $1`, [keyHash])).rows[0];
          if (!denial) throw new TasteServiceError("QLOO_BUDGET_STORE", "The shared request budget is unavailable. No live request was sent.");
          if (denial.stopped_code) throw new TasteServiceError("QLOO_STOPPED", "Live requests are paused after a provider or operator stop. Ask the operator to review it.");
          if (denial.expired) throw new TasteServiceError("QLOO_NOT_CONFIGURED", "The shared access period has expired. Ask the operator to review it.");
          if (denial.exhausted) throw new TasteServiceError("QLOO_QUOTA", "The shared request allowance is exhausted. Ask the operator to review it.", 429);
          if (denial.rate_limited) {
            const error = new TasteServiceError("QLOO_RATE_LIMIT", "The shared minute limit was reached. Try again after the rate window resets.", 429);
            error.retryAfterSeconds = denial.retry_after_seconds;
            throw error;
          }
          throw new TasteServiceError("QLOO_QUOTA", "The shared request allowance is unavailable. Try again later or ask the operator to review it.", 429);
        }
      } catch (error) {
        if (error instanceof TasteServiceError) throw error;
        throw new TasteServiceError("QLOO_BUDGET_STORE", "The shared request budget is unavailable. Live calls are stopped.");
      }
      return result.rows[0].used;
    },
    async stop(reason) {
      const safeReason = /^(?:HTTP_[1-5]\d\d|TRANSPORT_FAILURE|UNEXPECTED_DESTINATION)$/.test(reason) ? reason : "BUDGET_STOP";
      await database.query("UPDATE qloo_http_budget SET stopped_code = COALESCE(stopped_code, $2) WHERE key_hash = $1", [keyHash, safeReason]);
    },
  };
}

export function createSharedQlooTransport({ fetchImpl, budget }) {
  let stopped = false;
  const abort = new AbortController();
  async function stop(reason) {
    stopped = true;
    abort.abort(new Error("SHARED_QLOO_STOPPED"));
    await budget.stop(reason);
  }
  return async (input, init = {}) => {
    if (stopped) throw new Error("SHARED_QLOO_STOPPED");
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input)); }
    catch { await stop("UNEXPECTED_DESTINATION"); throw new Error("SHARED_QLOO_STOPPED"); }
    const method = init.method ?? (input instanceof Request ? input.method : "GET");
    if (url.origin !== "https://hackathon.api.qloo.com" || url.username || url.password || url.hash || method !== "GET" ||
        !["/v2/tags", "/v2/insights", "/entities"].includes(url.pathname) ||
        [...url.searchParams.keys()].some((key) => /^(?:api[_-]?key|key|token|authorization)$/i.test(key))) {
      await stop("UNEXPECTED_DESTINATION");
      throw new Error("SHARED_QLOO_STOPPED");
    }
    try { await budget.reserve(); }
    catch (error) {
      // A temporary denial consumes no outbound attempt and must not latch
      // this transport. The database is consulted on every later invocation.
      if (error instanceof TasteServiceError && error.code === "QLOO_RATE_LIMIT")
        return Response.json({ error: error.message, code: error.code }, {
          status: 429, headers: { "Retry-After": String(error.retryAfterSeconds || 60) },
        });
      throw error;
    }
    try {
      const response = await fetchImpl(input, {
        ...init, redirect: "error",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000), ...(init.signal ? [init.signal] : [])]),
      });
      if (!response.ok) await stop("HTTP_" + response.status);
      return response;
    } catch {
      await stop("TRANSPORT_FAILURE").catch(() => {});
      throw new Error("SHARED_QLOO_STOPPED");
    }
  };
}
