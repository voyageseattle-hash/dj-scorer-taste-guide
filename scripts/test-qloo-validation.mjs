import assert from "node:assert/strict";
import { createValidationTransport } from "./qloo-validation-transport.mjs";

const destination = "https://hackathon.api.qloo.com/v2/tags?filter.query=House";
let calls = 0;
let stored;
const transport = createValidationTransport({
  fetchImpl: async (_input, init) => {
    assert.equal(init.redirect, "error");
    assert.equal(stored.outboundAttempts, calls + 1);
    calls++;
    return new Response("{}", { status: 200 });
  },
  persist: (state) => { stored = state; },
});
await Promise.all(Array.from({ length: 5 }, () => transport.fetch(destination)));
await assert.rejects(() => transport.fetch(destination));
assert.equal(calls, 5);
assert.equal(transport.snapshot().outboundAttempts, 5);
const resumed = createValidationTransport({ fetchImpl: async () => { calls++; }, initial: stored, persist() {} });
await assert.rejects(() => resumed.fetch(destination));
assert.equal(calls, 5);

for (const status of [301, 400, 401, 402, 403, 429, 500, 503]) {
  let statusCalls = 0;
  const guarded = createValidationTransport({
    fetchImpl: async () => { statusCalls++; return new Response("{}", { status }); },
    persist() {},
  });
  await guarded.fetch(destination);
  await assert.rejects(() => guarded.fetch(destination));
  assert.equal(statusCalls, 1);
  assert.equal(guarded.snapshot().stopReason, "HTTP_" + status);
}
let failureCalls = 0;
const broken = createValidationTransport({
  fetchImpl: async () => { failureCalls++; throw new Error("private provider detail"); },
  persist() {},
});
await assert.rejects(() => broken.fetch(destination), /VALIDATION_STOPPED/);
await assert.rejects(() => broken.fetch(destination));
assert.equal(failureCalls, 1);

for (const [url, init] of [
  ["https://other.invalid/v2/tags", {}],
  ["https://hackathon.api.qloo.com/account", {}],
  [destination + "&api_key=fixture", {}],
  [destination, { method: "POST" }],
]) {
  const denied = createValidationTransport({ fetchImpl: async () => assert.fail("Unexpected network call"), persist() {} });
  await assert.rejects(() => denied.fetch(url, init));
  assert.equal(denied.snapshot().outboundAttempts, 0);
}
const diskFailure = createValidationTransport({
  fetchImpl: async () => assert.fail("Cannot send without a persisted reservation"),
  persist() { throw new Error("disk fixture"); },
});
await assert.rejects(() => diskFailure.fetch(destination));
assert.throws(() => createValidationTransport({ fetchImpl() {}, initial: { outboundAttempts: -1 }, persist() {} }));
console.log("PASS Five-request cap, parallel calls, persisted rerun limit, stop-on-error, trusted endpoint, redirects, and fail-closed persistence. Zero live requests.");

// Exercise the actual SDK transport captured by the application factory.
const { HarnessTasteProvider } = await import("../server/tasteProvider.ts");
const { QlooCallBudget } = await import("../server/qlooAccess.ts");
const env = {
  QLOO_API_KEY: "offline-fixture-only", QLOO_ENABLED: "true",
  QLOO_FREE_ACCESS_CONFIRMED: "true", QLOO_HOSTING_PERMITTED_CONFIRMED: "true",
  QLOO_EVENT_QUOTA: "15", QLOO_EVENT_RATE_PER_MINUTE: "15",
  QLOO_ACCESS_EXPIRES_AT: "2099-01-01T00:00:00Z",
};
const tag = { tag_id: "urn:tag:genre:music:house", name: "House", type: "urn:tag:genre:music", affinity: 0.8 };
const artists = [
  { entity_id: "11111111-1111-4111-8111-111111111111", name: "Fixture Artist", type: "urn:entity", subtype: "urn:entity:artist", query: { affinity: 0.7 } },
  { entity_id: "22222222-2222-4222-8222-222222222222", name: "Second Fixture Artist", type: "urn:entity", subtype: "urn:entity:artist", query: { affinity: 0.6 } },
];
let sdkCalls = 0;
const sdkTransport = createValidationTransport({
  fetchImpl: async (input) => {
    sdkCalls++;
    const url = new URL(input);
    if (url.pathname === "/v2/tags") assert.equal(url.searchParams.get("filter.query"), "House");
    const results = url.pathname === "/v2/tags" || url.searchParams.get("filter.type") === "urn:tag"
      ? { tags: [tag] }
      : { entities: url.pathname === "/entities"
          ? artists.filter((artist) => url.searchParams.get("entity_ids").includes(artist.entity_id))
          : artists };
    return Response.json({ results });
  },
  persist() {},
});
const originalFetch = globalThis.fetch;
globalThis.fetch = sdkTransport.fetch;
try {
  const sdkProvider = new HarnessTasteProvider(env, new QlooCallBudget(env));
  const choices = await sdkProvider.findTags("house");
  const recommended = await sdkProvider.recommend(choices[0]);
  assert.equal(recommended.length, 2);
  assert.equal((await sdkProvider.artistTags(recommended)).length, 1);
  assert.equal(sdkCalls, 5);
  assert.equal(sdkTransport.snapshot().outboundAttempts, 5);
  assert.equal(sdkTransport.snapshot().stopReason, null);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("PASS Real SDK factory and application adapter use the bounded transport for all five mocked workflow calls. Zero live requests.");
