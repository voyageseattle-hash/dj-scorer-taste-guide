import assert from "node:assert/strict";
import { once } from "node:events";
import { createDemoApp } from "../server.mjs";
import { fixtureTasteProvider } from "../server/tasteFixtures.ts";

const env = {
  QLOO_API_KEY: "offline-fixture-only", QLOO_ENABLED: "true", QLOO_OPERATOR_APPROVED: "true",
  QLOO_FREE_ACCESS_CONFIRMED: "true", QLOO_HOSTING_PERMITTED_CONFIRMED: "true",
  QLOO_EVENT_QUOTA: "15", QLOO_EVENT_RATE_PER_MINUTE: "15", QLOO_ACCESS_EXPIRES_AT: "2099-01-01T00:00:00Z",
  APP_URL: "http://demo.invalid",
};
const server = createDemoApp({ env, provider: fixtureTasteProvider() }).listen(0, "127.0.0.1");
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
const originalFetch = globalThis.fetch;
// Reject every non-loopback request, even if a future edit tries a real API.
globalThis.fetch = (input, init) => {
  assert.equal(new URL(input).origin, base, "Offline smoke test cannot contact a provider");
  return originalFetch(input, init);
};
const post = (route, body, headers = {}) => fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
try {
  for (const requested of ["/.env", "/.env.example", "/.git/config", "/data/qloo-request-count.json", "/artifacts/private.json", "/server/tasteProvider.ts", "/scripts/test-demo.mjs"])
    assert.equal((await fetch(base + requested)).status, 404);
  assert.equal((await fetch(base + "/api/unknown")).status, 404);
  assert.equal((await fetch(base + "/health")).status, 200);
  assert.equal((await fetch(base + "/about")).status, 200);
  const request = await post("/api/taste/tags", { genre: "house" });
  assert.equal(request.status, 200);
  const session = request.headers.get("set-cookie");
  assert.match(session, /HttpOnly; SameSite=Strict/);
  const choice = (await request.json()).choices[0].token;
  const body = { choiceToken: choice, goal: "smooth_transitions", region: "SEA", today: "2026-10-15" };
  assert.equal((await post("/api/taste/plan", body)).status, 400, "Choices belong to the issuing anonymous session");
  const plan = await post("/api/taste/plan", body, { Cookie: session.split(";")[0] });
  assert.equal(plan.status, 200);
  assert.equal((await plan.json()).mode, "offline_fixture");
  assert.equal((await post("/api/taste/tags", { genre: "house" }, { Origin: "https://other.invalid" })).status, 403);
  const preview = await post("/api/taste/preview", { goal: "discover_scene", region: "SEA", today: "2026-10-15" });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.mode, "offline_fixture");
  assert.ok(previewBody.limitations.some((entry) => entry.includes("invented")));
  assert.equal(preview.headers.get("cache-control"), "no-store");
  console.log("PASS Standalone demo session ownership, cookie flags, origin checks, private-path guards, health/about, and honest offline preview. Zero live requests.");
} finally {
  globalThis.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
}
