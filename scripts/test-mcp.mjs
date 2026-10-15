import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentServer } from "./mcp-server.mjs";
import { fixtureTasteProvider } from "../server/tasteFixtures.ts";

const env = {
  QLOO_API_KEY: "offline-fixture-only", QLOO_ENABLED: "true", QLOO_OPERATOR_APPROVED: "true",
  QLOO_FREE_ACCESS_CONFIRMED: "true", QLOO_HOSTING_PERMITTED_CONFIRMED: "true",
  QLOO_EVENT_QUOTA: "15", QLOO_EVENT_RATE_PER_MINUTE: "15", QLOO_ACCESS_EXPIRES_AT: "2099-01-01T00:00:00Z",
};
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("Offline agent test cannot contact an external provider"); };
const agent = await createAgentServer({ env, provider: fixtureTasteProvider() });
const client = new Client({ name: "offline-agent-test", version: "1.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
try {
  await agent.server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["build_practice_plan", "find_music_tags", "preview_practice_plan", "taste_status"]);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint === true));
  const call = (name, args) => client.callTool({ name, arguments: args });
  const status = await call("taste_status", {});
  assert.equal(status.structuredContent.state, "ready");
  const tags = await call("find_music_tags", { genre: "house" });
  assert.equal(tags.isError, false);
  const choice = tags.structuredContent.choices[0].token;
  const settings = { goal: "smooth_transitions", region: "SEA", today: "2026-10-15" };
  const invalid = await call("build_practice_plan", { choiceToken: choice, userConfirmedTag: false, ...settings }).catch(() => ({ isError: true }));
  assert.equal(invalid.isError, true, "An agent must explicitly confirm the tag");
  const plan = await call("build_practice_plan", { choiceToken: choice, userConfirmedTag: true, ...settings });
  assert.equal(plan.isError, false);
  assert.equal(plan.structuredContent.mode, "offline_fixture");
  assert.equal(plan.structuredContent.practice.steps.length, 3);
  const preview = await call("preview_practice_plan", { ...settings, goal: "discover_scene" });
  assert.equal(preview.structuredContent.mode, "offline_fixture");
  assert.ok(preview.structuredContent.limitations.some((entry) => entry.includes("invented")));
  assert.ok(!JSON.stringify(plan).includes(env.QLOO_API_KEY));
  console.log("PASS Real MCP client initialization, tool discovery, readiness, confirmed-choice planning, schema rejection and honest offline preview. Zero Qloo/LLM requests.");
} finally {
  globalThis.fetch = originalFetch;
  await client.close();
  await agent.close();
}
