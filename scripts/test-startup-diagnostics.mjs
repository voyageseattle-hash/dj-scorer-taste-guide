import assert from "node:assert/strict";
import { StartupFailure, startupRecord } from "../server/startupDiagnostics.mjs";
import { createConfiguredRuntime } from "../server/configuredRuntime.mjs";
import { createNetlifyHandler } from "../netlify/functions/api.mjs";

const env = {
  QLOO_API_KEY: "offline-fixture-only", QLOO_ENABLED: "true", QLOO_OPERATOR_APPROVED: "true",
  QLOO_EVENT_DEMO_OPERATOR_APPROVED: "true", QLOO_FREE_ACCESS_CONFIRMED: "false", QLOO_HOSTING_PERMITTED_CONFIRMED: "false",
  QLOO_EVENT_QUOTA: "200", QLOO_EVENT_RATE_PER_MINUTE: "15", QLOO_ACCESS_EXPIRES_AT: "2026-11-17T04:45:00Z",
  QLOO_BUDGET_BACKEND: "postgres", QLOO_BUDGET_DATABASE_URL: "postgresql://offline.invalid/offline?sslmode=disable", QLOO_PRIOR_HTTP_ATTEMPTS: "5",
};
const markers = ["CREDENTIAL_MARKER", "URL_MARKER", "RESPONSE_MARKER"];
const failure = (code) => Object.assign(new Error(markers.join(" ")), { code, detail: markers[0], stack: markers[1], cause: { body: markers[2] } });
const cases = [
  ["28P01", "DATABASE_AUTH"], ["42501", "DATABASE_PERMISSION"], ["ENOTFOUND", "DNS_UNAVAILABLE"],
  ["ECONNREFUSED", "NETWORK_UNAVAILABLE"], ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "TLS_VERIFICATION"],
  ["ERR_MODULE_NOT_FOUND", "MODULE_UNAVAILABLE"], ["3D000", "DATABASE_NOT_FOUND"],
  ["53300", "DATABASE_CAPACITY"], ["57P03", "DATABASE_UNAVAILABLE"], ["PRIVATE_CODE", "UNKNOWN"],
];
const originalFetch = globalThis.fetch;
let nativeCalls = 0;
globalThis.fetch = () => { nativeCalls++; assert.fail("Startup diagnostics cannot dispatch a provider request"); };
const event = { path: "/api/taste/status", httpMethod: "GET", headers: {}, body: null };
async function inspect(initialize, overrides = {}) {
  const logs = [];
  const handler = createNetlifyHandler({ env, deploymentContext: "production", initialize, reportStartup: (record) => logs.push(record), ...overrides });
  for (let index = 0; index < 2; index++) {
    const response = await handler(event, {});
    assert.equal(response.statusCode, 503);
    assert.equal(JSON.parse(response.body).code, "TASTE_UNAVAILABLE");
    assert.deepEqual(Object.keys(JSON.parse(response.body)).sort(), ["code", "error"]);
    for (const marker of markers) assert.ok(!response.body.includes(marker));
  }
  assert.equal(logs.length, 1, "Repeated cold-start failures log only one identical category per container");
  for (const marker of markers) assert.ok(!JSON.stringify(logs).includes(marker));
  assert.deepEqual(Object.keys(logs[0]).sort(), ["event", "reason", "stage"]);
  return logs[0];
}
let lastOptions, ends;
function poolFactory(code, failState = false) {
  ends = 0;
  return class OfflinePool {
    constructor(options) { lastOptions = options; }
    on() {}
    async query(sql) {
      if (code && (!failState || sql.includes("taste_sessions"))) throw failure(code);
      return { rows: [] };
    }
    async end() { ends++; }
  };
}
try {
  for (const [code, reason] of cases) {
    const record = await inspect((_root, config) => createConfiguredRuntime("unused-offline-root", config, { loadPostgres: async () => ({ Pool: poolFactory(code) }) }));
    assert.equal(record.stage, "BUDGET_STORE");
    assert.equal(record.reason, reason);
    assert.equal(ends, 1);
    assert.equal(lastOptions.ssl.rejectUnauthorized, true, "Diagnostics never relax certificate verification");
    assert.ok(!lastOptions.connectionString.includes("sslmode"), "URL SSL overrides remain removed");
  }
  const loadFailure = await inspect((_root, config) => createConfiguredRuntime("unused-offline-root", config, { loadPostgres: async () => { throw failure("ERR_MODULE_NOT_FOUND"); } }));
  assert.equal(loadFailure.stage, "POSTGRES_IMPORT");
  assert.equal(loadFailure.reason, "MODULE_UNAVAILABLE");
  const stateFailure = await inspect((_root, config) => createConfiguredRuntime("unused-offline-root", config, { loadPostgres: async () => ({ Pool: poolFactory("42501", true) }) }));
  assert.equal(stateFailure.stage, "SESSION_STORE");
  assert.equal(stateFailure.reason, "STATE_UNAVAILABLE");
  for (const [overrides, stage, reason] of [
    [{ deploymentContext: "nonproduction" }, "BUILD_CONTEXT", "NONPRODUCTION_BUILD"],
    [{ env: { ...env, QLOO_EVENT_DEMO_OPERATOR_APPROVED: "false" } }, "LIVE_GATE", "EVENT_APPROVAL_REQUIRED"],
    [{ env: { ...env, QLOO_OPERATOR_APPROVED: "false" } }, "LIVE_GATE", "OPERATOR_APPROVAL_REQUIRED"],
    [{ env: { ...env, QLOO_BUDGET_BACKEND: "file" } }, "LIVE_GATE", "POSTGRES_REQUIRED"],
  ]) {
    const record = await inspect(async () => assert.fail("Gate must reject before database initialization"), overrides);
    assert.equal(record.stage, stage); assert.equal(record.reason, reason);
  }
  const readiness = await inspect((_root, config) => createConfiguredRuntime("unused-offline-root", config), { env: { ...env, QLOO_PRIOR_HTTP_ATTEMPTS: "4" } });
  assert.equal(readiness.stage, "READINESS");
  const url = await inspect((_root, config) => createConfiguredRuntime("unused-offline-root", config), { env: { ...env, QLOO_BUDGET_DATABASE_URL: "offline-invalid-shape" } });
  assert.equal(url.stage, "DATABASE_URL");
  const untrusted = failure(markers[0]); untrusted.stage = markers[1]; untrusted.reason = markers[2];
  assert.deepEqual(startupRecord(untrusted), { event: "DJ_TASTE_STARTUP_FAILED", stage: "RUNTIME", reason: "UNKNOWN" });
  const altered = new StartupFailure("BUDGET_STORE"); altered.stage = markers[0]; altered.reason = markers[1];
  for (const marker of markers) assert.ok(!JSON.stringify(startupRecord(altered)).includes(marker));
  const native = globalThis.fetch;
  const runtime = await createConfiguredRuntime("unused-offline-root", env, { loadPostgres: async () => ({ Pool: poolFactory() }) });
  assert.ok(runtime.state);
  await runtime.release();
  assert.equal(globalThis.fetch, native);
  assert.equal(nativeCalls, 0);
  console.log("PASS Allowlisted startup stages/categories, message/stack/cause/URL/credential redaction, duplicate suppression, unchanged TLS, failed-start cleanup and zero provider dispatch. Synthetic pool only; no database connections.");
} finally { globalThis.fetch = originalFetch; }
