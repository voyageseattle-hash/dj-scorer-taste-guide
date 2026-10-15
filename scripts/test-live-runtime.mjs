import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { activateLiveTransport } from "../server/liveRuntime.mjs";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dj-taste-runtime-"));
const env = {
  QLOO_API_KEY: "offline-fixture-only", QLOO_ENABLED: "true", QLOO_OPERATOR_APPROVED: "true",
  QLOO_FREE_ACCESS_CONFIRMED: "true", QLOO_HOSTING_PERMITTED_CONFIRMED: "true",
  QLOO_EVENT_QUOTA: "15", QLOO_EVENT_RATE_PER_MINUTE: "15", QLOO_ACCESS_EXPIRES_AT: "2099-01-01T00:00:00Z",
  QLOO_PRIOR_HTTP_ATTEMPTS: "0",
};
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => { calls++; return Response.json({}); };
let release = () => {};
try {
  assert.throws(() => activateLiveTransport(root, { ...env, NODE_ENV: "production" }), /durable/);
  release = activateLiveTransport(root, env);
  assert.throws(() => activateLiveTransport(root, env), /EEXIST/);
  for (let index = 0; index < 5; index++) await fetch("https://hackathon.api.qloo.com/v2/tags");
  release();
  release = activateLiveTransport(root, env);
  await assert.rejects(() => fetch("https://hackathon.api.qloo.com/v2/tags"));
  assert.equal(calls, 5);
  release();
  fs.writeFileSync(path.join(root, "data", "qloo-request-count.json"), "invalid fixture");
  assert.throws(() => activateLiveTransport(root, env));
  assert.equal(fs.existsSync(path.join(root, "data", "qloo-live.lock")), false);
  const beforeCarryover = calls;
  const carryRoot = path.join(root, "prior-five");
  release = activateLiveTransport(carryRoot, { ...env, QLOO_EVENT_QUOTA: "5", QLOO_PRIOR_HTTP_ATTEMPTS: "5" });
  assert.equal(JSON.parse(fs.readFileSync(path.join(carryRoot, "data", "qloo-request-count.json"), "utf8")).outboundAttempts, 5);
  await assert.rejects(() => fetch("https://hackathon.api.qloo.com/v2/tags"));
  assert.equal(calls, beforeCarryover, "Quota five and prior usage five permit ZERO dispatches");
  release();
  release = activateLiveTransport(carryRoot, { ...env, QLOO_PRIOR_HTTP_ATTEMPTS: "0" });
  await assert.rejects(() => fetch("https://hackathon.api.qloo.com/v2/tags"));
  assert.equal(calls, beforeCarryover, "A smaller later prior-usage setting cannot erase persisted usage");
  release();
  const largerRoot = path.join(root, "larger-existing");
  fs.mkdirSync(path.join(largerRoot, "data"), { recursive: true });
  fs.writeFileSync(path.join(largerRoot, "data", "qloo-request-count.json"), JSON.stringify({ outboundAttempts: 6 }));
  release = activateLiveTransport(largerRoot, { ...env, QLOO_PRIOR_HTTP_ATTEMPTS: "5" });
  assert.equal(JSON.parse(fs.readFileSync(path.join(largerRoot, "data", "qloo-request-count.json"), "utf8")).outboundAttempts, 6);
  await assert.rejects(() => fetch("https://hackathon.api.qloo.com/v2/tags"));
  assert.equal(calls, beforeCarryover, "An existing larger count is retained and remains blocked");
  release();
  const smallQuotaRoot = path.join(root, "prior-three");
  release = activateLiveTransport(smallQuotaRoot, { ...env, QLOO_EVENT_QUOTA: "3", QLOO_PRIOR_HTTP_ATTEMPTS: "3" });
  await assert.rejects(() => fetch("https://hackathon.api.qloo.com/v2/tags"));
  assert.equal(calls, beforeCarryover, "A configured quota below five remains authoritative");
  release();
  for (const prior of [undefined, "-1", "1.5", "invalid", "99999999999999999999"])
    assert.throws(() => activateLiveTransport(path.join(root, "invalid-prior"), { ...env, QLOO_PRIOR_HTTP_ATTEMPTS: prior }));
  console.log("PASS File prior-usage validation/carryover, retained larger counters, zero dispatch at quota five/prior five, cumulative cap, live lock and production storage gate. Zero live requests.");
} finally {
  release();
  globalThis.fetch = originalFetch;
  if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unexpected temporary directory");
  fs.rmSync(root, { recursive: true, force: true });
}
