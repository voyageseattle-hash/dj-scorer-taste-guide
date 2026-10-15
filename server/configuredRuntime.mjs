import { createHash } from "node:crypto";
import { qlooReadiness } from "./qlooAccess.ts";
import { activateLiveTransport } from "./liveRuntime.mjs";
import { createPostgresBudget, createSharedQlooTransport } from "./postgresBudget.mjs";
import { createPostgresTasteState } from "./tasteState.ts";
import { StartupFailure, startupReason } from "./startupDiagnostics.mjs";

export async function createConfiguredRuntime(root, env, { loadPostgres = () => import("pg") } = {}) {
  if (env.QLOO_ENABLED !== "true" || env.QLOO_OPERATOR_APPROVED !== "true") return { release: () => {} };
  if (env.QLOO_BUDGET_BACKEND !== "postgres") return { release: activateLiveTransport(root, env) };
  if (qlooReadiness(env).state !== "ready" || !env.QLOO_BUDGET_DATABASE_URL || !/^\d+$/.test(env.QLOO_PRIOR_HTTP_ATTEMPTS || ""))
    throw new StartupFailure("READINESS", "CONFIGURATION");
  let databaseUrl;
  try { databaseUrl = new URL(env.QLOO_BUDGET_DATABASE_URL); }
  catch { throw new StartupFailure("DATABASE_URL", "CONFIGURATION"); }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new StartupFailure("DATABASE_URL", "CONFIGURATION");
  // URL SSL parameters must not override verified TLS in node-postgres.
  for (const field of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) databaseUrl.searchParams.delete(field);
  let Pool;
  try { ({ Pool } = await loadPostgres()); }
  catch (error) { throw new StartupFailure("POSTGRES_IMPORT", startupReason(error)); }
  let pool;
  try { pool = new Pool({
    connectionString: databaseUrl.href, max: 2,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000,
    query_timeout: 10000, statement_timeout: 10000,
    ssl: { rejectUnauthorized: true },
  });
  pool.on("error", () => {});
  } catch (error) { throw new StartupFailure("POSTGRES_POOL", startupReason(error)); }
  const nativeFetch = globalThis.fetch;
  let stage = "BUDGET_STORE";
  try {
    const keyHash = createHash("sha256").update(env.QLOO_API_KEY).digest("hex");
    const budget = await createPostgresBudget(pool, keyHash, {
      cap: Math.min(Number(env.QLOO_EVENT_QUOTA), 200),
      rate: Math.min(Number(env.QLOO_EVENT_RATE_PER_MINUTE), 30),
      expiresAt: env.QLOO_ACCESS_EXPIRES_AT,
      priorUsed: Number(env.QLOO_PRIOR_HTTP_ATTEMPTS),
    });
    stage = "SESSION_STORE";
    const state = await createPostgresTasteState(pool);
    globalThis.fetch = createSharedQlooTransport({ fetchImpl: nativeFetch, budget });
    return { state, release: async () => { globalThis.fetch = nativeFetch; await pool.end(); } };
  } catch (error) {
    await pool.end().catch(() => {});
    throw new StartupFailure(stage, startupReason(error));
  }
}

// Compatibility entry point for callers that only need the guarded transport.
export async function activateConfiguredTransport(root, env) {
  return (await createConfiguredRuntime(root, env)).release;
}
