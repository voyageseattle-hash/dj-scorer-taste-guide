import { createHash } from "node:crypto";
import { qlooReadiness } from "./qlooAccess.ts";
import { activateLiveTransport } from "./liveRuntime.mjs";
import { createPostgresBudget, createSharedQlooTransport } from "./postgresBudget.mjs";
import { createPostgresTasteState } from "./tasteState.ts";

export async function createConfiguredRuntime(root, env) {
  if (env.QLOO_ENABLED !== "true" || env.QLOO_OPERATOR_APPROVED !== "true") return { release: () => {} };
  if (env.QLOO_BUDGET_BACKEND !== "postgres") return { release: activateLiveTransport(root, env) };
  if (qlooReadiness(env).state !== "ready" || !env.QLOO_BUDGET_DATABASE_URL || !/^\d+$/.test(env.QLOO_PRIOR_HTTP_ATTEMPTS || ""))
    throw new Error("Shared live budget configuration is incomplete.");
  const databaseUrl = new URL(env.QLOO_BUDGET_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new Error("Invalid database connection configuration.");
  // URL SSL parameters must not override verified TLS in node-postgres.
  for (const field of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) databaseUrl.searchParams.delete(field);
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl.href, max: 2,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000,
    query_timeout: 10000, statement_timeout: 10000,
    ssl: { rejectUnauthorized: true },
  });
  pool.on("error", () => {});
  const nativeFetch = globalThis.fetch;
  try {
    const keyHash = createHash("sha256").update(env.QLOO_API_KEY).digest("hex");
    const budget = await createPostgresBudget(pool, keyHash, {
      cap: Math.min(Number(env.QLOO_EVENT_QUOTA), 200),
      rate: Math.min(Number(env.QLOO_EVENT_RATE_PER_MINUTE), 30),
      expiresAt: env.QLOO_ACCESS_EXPIRES_AT,
      priorUsed: Number(env.QLOO_PRIOR_HTTP_ATTEMPTS),
    });
    const state = await createPostgresTasteState(pool);
    globalThis.fetch = createSharedQlooTransport({ fetchImpl: nativeFetch, budget });
    return { state, release: async () => { globalThis.fetch = nativeFetch; await pool.end(); } };
  } catch {
    await pool.end();
    throw new Error("The shared budget could not be initialized. Live access remains stopped.");
  }
}

// Compatibility entry point for callers that only need the guarded transport.
export async function activateConfiguredTransport(root, env) {
  return (await createConfiguredRuntime(root, env)).release;
}
