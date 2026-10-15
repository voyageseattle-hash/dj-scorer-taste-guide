import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createNetlifyHandler } from "../netlify/functions/api.mjs";
import { createPostgresTasteState } from "../server/tasteState.ts";
import { fixtureTasteProvider } from "../server/tasteFixtures.ts";

const database = new PGlite();
const originalFetch = globalThis.fetch;
globalThis.fetch = () => assert.fail("Function tests cannot contact any external service");
const env = {
  URL: "https://offline-demo.invalid",
  QLOO_API_KEY: "offline-fixture-only", QLOO_ENABLED: "true", QLOO_OPERATOR_APPROVED: "true",
  QLOO_EVENT_DEMO_OPERATOR_APPROVED: "true", QLOO_FREE_ACCESS_CONFIRMED: "false", QLOO_HOSTING_PERMITTED_CONFIRMED: "false",
  QLOO_EVENT_QUOTA: "200", QLOO_EVENT_RATE_PER_MINUTE: "15", QLOO_ACCESS_EXPIRES_AT: "2026-11-17T04:45:00Z",
  QLOO_BUDGET_BACKEND: "postgres", QLOO_BUDGET_DATABASE_URL: "offline-database-fixture", QLOO_PRIOR_HTTP_ATTEMPTS: "5",
};
const settings = { goal: "smooth_transitions", region: "SEA", today: "2026-10-15" };
let recommendations = 0;
const fixture = fixtureTasteProvider();
const provider = { ...fixture, recommend: async (tag) => { recommendations++; return fixture.recommend(tag); } };
let initializations = 0;
const initialize = async () => { initializations++; return { state: await createPostgresTasteState(database), release: async () => {} }; };
const makeHandler = (overrides = {}) => createNetlifyHandler({ env, initialize, provider, deploymentContext: "production", ...overrides });
function call(handler, path, body, cookie, extraHeaders = {}) {
  return handler({ path, httpMethod: body === undefined ? "GET" : "POST", headers: {
    "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extraHeaders,
  }, body: body === undefined ? null : JSON.stringify(body), isBase64Encoded: false,
  requestContext: { identity: { sourceIp: "127.0.0.1" } } }, { awsRequestId: "offline-test" });
}
const json = (result) => JSON.parse(result.body);
const cookieFrom = (result) => (result.multiValueHeaders?.["set-cookie"]?.[0] || result.headers?.["set-cookie"] || "").split(";")[0];
try {
  const first = makeHandler();
  const second = makeHandler();
  const status = await call(first, "/api/taste/status");
  assert.equal(status.statusCode, 200);
  assert.equal(json(status).accessBasis, "operator_approved_event_demo");
  assert.deepEqual(json(status).issuerConfirmations, { freeAccess: false, hostingPermission: false });
  const tags = await call(first, "/api/taste/tags", { genre: "house" });
  assert.equal(tags.statusCode, 200);
  const cookie = cookieFrom(tags);
  assert.match(cookie, /^dj_taste_session=/);
  assert.match(JSON.stringify({ ...tags.headers, ...tags.multiValueHeaders }), /HttpOnly; SameSite=Strict.*Secure/);
  const choiceToken = json(tags).choices[0].token;
  const plan = await call(second, "/.netlify/functions/api/taste/plan", { choiceToken, ...settings }, cookie);
  assert.equal(plan.statusCode, 200, "A fresh function instance resolves the stored session and canonical choice");
  assert.equal(json(plan).mode, "offline_fixture");
  assert.equal(initializations, 2);
  assert.equal((await call(second, "/api/taste/plan", { choiceToken, ...settings })).statusCode, 400, "Another browser cannot use this choice");
  assert.equal((await call(second, "/api/taste/plan", { choiceToken: randomUUID(), ...settings }, cookie)).statusCode, 400);
  assert.equal((await call(second, "/api/taste/plan", { choiceToken, ...settings, tag: { id: "client-crafted" } }, cookie)).statusCode, 400);
  assert.equal(recommendations, 1, "Invalid ownership, invented tokens and client-crafted provider inputs never reach the provider");
  assert.equal((await call(first, "/api/taste/tags", { genre: "house" }, cookie, { origin: "https://wrong.invalid" })).statusCode, 403);
  assert.equal(initializations, 2, "Warm invocations reuse initialization instead of wrapping fetch again");
  await database.query("UPDATE taste_choices SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE token = $1", [choiceToken]);
  assert.equal((await call(second, "/api/taste/plan", { choiceToken, ...settings }, cookie)).statusCode, 400);
  const renewed = await call(first, "/api/taste/tags", { genre: "house" }, cookie);
  const renewedToken = json(renewed).choices[0].token;
  await database.query("UPDATE taste_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'");
  assert.equal((await call(second, "/api/taste/plan", { choiceToken: renewedToken, ...settings }, cookie)).statusCode, 400, "Expired sessions cannot redeem choices");
  assert.equal(recommendations, 1);
  const offline = makeHandler({ env: {}, initialize: async () => ({ release: () => {} }) });
  const preview = await call(offline, "/api/taste/preview", settings);
  assert.equal(preview.statusCode, 200);
  assert.equal(json(preview).mode, "offline_fixture");
  for (const route of ["/health", "/about", "/.netlify/functions/api/health", "/.netlify/functions/api/about"])
    assert.equal((await call(offline, route)).statusCode, 200);
  for (const route of ["/.env", "/server/configuredRuntime.mjs", "/netlify/functions/api.mjs", "/data/private.json"])
    assert.equal((await call(offline, route)).statusCode, 404);
  let attemptedInit = 0;
  for (const overrides of [{ QLOO_BUDGET_BACKEND: "file" }, { QLOO_EVENT_DEMO_OPERATOR_APPROVED: "false" }]) {
    const blocked = makeHandler({ env: { ...env, ...overrides }, initialize: async () => { attemptedInit++; throw new Error("Must not initialize"); } });
    assert.equal((await call(blocked, "/api/taste/status")).statusCode, 503);
  }
  const previewBuild = makeHandler({ deploymentContext: "nonproduction", initialize: async () => { attemptedInit++; throw new Error("Must not initialize"); } });
  assert.equal((await call(previewBuild, "/api/taste/status")).statusCode, 503);
  assert.equal(attemptedInit, 0);
  const noState = makeHandler({ initialize: async () => ({ release: () => {} }) });
  assert.equal((await call(noState, "/api/taste/tags", { genre: "house" })).statusCode, 503);
  const brokenState = await createPostgresTasteState({ query: async () => ({ rows: [] }) });
  const broken = makeHandler({ initialize: async () => ({ state: brokenState, release: () => {} }) });
  const denied = await call(broken, "/api/taste/plan", { choiceToken, ...settings }, cookie);
  assert.equal(denied.statusCode, 429);
  const unavailableState = await createPostgresTasteState({ query: async (sql) => {
    if (sql.startsWith("CREATE TABLE")) return { rows: [] };
    throw new Error("Private database failure fixture");
  } });
  const unavailable = makeHandler({ initialize: async () => ({ state: unavailableState, release: () => {} }) });
  const storageFailure = await call(unavailable, "/api/taste/plan", { choiceToken, ...settings }, cookie);
  assert.equal(storageFailure.statusCode, 503);
  assert.equal(json(storageFailure).code, "TASTE_STATE");
  assert.ok(!storageFailure.body.includes("Private"));
  const failure = makeHandler({ initialize: async () => { throw new Error("Private database failure fixture"); } });
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await call(failure, "/api/taste/status");
    assert.equal(result.statusCode, 503);
    assert.ok(!result.body.includes("Private"));
  }
  assert.equal(recommendations, 1);
  console.log("PASS Netlify adapter: independent instances share actual Postgres sessions/choices; ownership, canonical inputs, expiry, disabled preview, origins, paths, cold-start failure and production/Postgres gates. Zero external calls.");
} finally {
  globalThis.fetch = originalFetch;
  await database.close();
}
