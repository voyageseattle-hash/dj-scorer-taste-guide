const stages = new Set(["BUILD_CONTEXT", "LIVE_GATE", "READINESS", "DATABASE_URL", "POSTGRES_IMPORT", "POSTGRES_POOL", "BUDGET_STORE", "SESSION_STORE", "DURABLE_STATE", "APP_ADAPTER", "RUNTIME"]);
const reasons = new Set(["NONPRODUCTION_BUILD", "EVENT_APPROVAL_REQUIRED", "OPERATOR_APPROVAL_REQUIRED", "POSTGRES_REQUIRED", "CONFIGURATION", "MODULE_UNAVAILABLE", "DNS_UNAVAILABLE", "NETWORK_UNAVAILABLE", "TLS_VERIFICATION", "DATABASE_AUTH", "DATABASE_NOT_FOUND", "DATABASE_PERMISSION", "DATABASE_CAPACITY", "DATABASE_UNAVAILABLE", "DATABASE_SCHEMA", "STATE_UNAVAILABLE", "UNKNOWN"]);
const codes = new Map([
  ...["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED", "ERR_REQUIRE_ESM", "ERR_DLOPEN_FAILED"].map((code) => [code, "MODULE_UNAVAILABLE"]),
  ...["ENOTFOUND", "EAI_AGAIN"].map((code) => [code, "DNS_UNAVAILABLE"]),
  ...["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"].map((code) => [code, "NETWORK_UNAVAILABLE"]),
  ...["CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_SSL_WRONG_VERSION_NUMBER"].map((code) => [code, "TLS_VERIFICATION"]),
  ["28P01", "DATABASE_AUTH"], ["28000", "DATABASE_AUTH"], ["3D000", "DATABASE_NOT_FOUND"], ["42501", "DATABASE_PERMISSION"], ["53300", "DATABASE_CAPACITY"], ["57P03", "DATABASE_UNAVAILABLE"], ["42P01", "DATABASE_SCHEMA"], ["23505", "DATABASE_SCHEMA"], ["TASTE_STATE", "STATE_UNAVAILABLE"],
]);
export function startupReason(error) { return codes.get(error?.code) || "UNKNOWN"; }
export class StartupFailure extends Error {
  constructor(stage, reason = "UNKNOWN") {
    super("Taste runtime initialization failed.");
    this.stage = stages.has(stage) ? stage : "RUNTIME";
    this.reason = reasons.has(reason) ? reason : "UNKNOWN";
  }
}
export function startupRecord(error) {
  // Never serialize the error, message, stack, cause, URL, env or SQL params.
  return { event: "DJ_TASTE_STARTUP_FAILED",
    stage: error instanceof StartupFailure && stages.has(error.stage) ? error.stage : "RUNTIME",
    reason: error instanceof StartupFailure && reasons.has(error.reason) ? error.reason : startupReason(error) };
}
