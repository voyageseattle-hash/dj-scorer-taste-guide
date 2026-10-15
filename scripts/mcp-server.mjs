import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDemoApp } from "../server.mjs";
import { activateConfiguredTransport } from "../server/configuredRuntime.mjs";
import { MUSIC_GENRES, TASTE_GOALS } from "../src/lib/tasteTypes.ts";
import { REGION_NAMES } from "../src/lib/regions.ts";

// This fetch is used only for a fixed loopback server, never for provider URLs.
const loopbackFetch = globalThis.fetch;
export async function createAgentServer(options = {}) {
  const backend = createDemoApp(options).listen(0, "127.0.0.1");
  await once(backend, "listening");
  const base = "http://127.0.0.1:" + backend.address().port;
  const server = new McpServer({ name: "dj-scorer-taste-guide", version: "0.1.0" });
  let sessionCookie = "";
  async function call(route, body) {
    const response = await loopbackFetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(sessionCookie ? { Cookie: sessionCookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25000),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) sessionCookie = cookie.split(";")[0];
    const result = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: !response.ok };
  }
  const settings = {
    goal: z.enum(TASTE_GOALS.map((entry) => entry.id)),
    region: z.enum(Object.keys(REGION_NAMES)),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  };
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  server.registerTool("taste_status", {
    title: "Check taste-guide availability", description: "Check server readiness without contacting Qloo. No key values are returned.",
    inputSchema: {}, annotations: readOnly,
  }, () => call("/api/taste/status"));
  server.registerTool("find_music_tags", {
    title: "Find canonical music tags",
    description: "Search Qloo for the selected public music genre. Requires approved live access and consumes the bounded request budget. Present returned choices and ask the user to confirm a tag before building a plan.",
    inputSchema: { genre: z.enum(MUSIC_GENRES.map((entry) => entry.id)) },
    annotations: { ...readOnly, openWorldHint: true },
  }, (body) => call("/api/taste/tags", body));
  server.registerTool("build_practice_plan", {
    title: "Build a plan from a confirmed tag",
    description: "Use a choice token returned in this agent session after the user confirms its tag. Recommend artists through Qloo, optionally expand artist tags for energy/discovery goals, then apply the deterministic DJ practice planner. Never claims an LLM generated the exercises.",
    inputSchema: { choiceToken: z.string().uuid(), userConfirmedTag: z.literal(true), ...settings },
    annotations: { ...readOnly, openWorldHint: true },
  }, ({ userConfirmedTag: _confirmed, ...body }) => call("/api/taste/plan", body));
  server.registerTool("preview_practice_plan", {
    title: "Preview the invented offline example",
    description: "Demonstrate the House-to-practice workflow with invented artists, affinities and venues. Makes zero Qloo or LLM calls; returns explicit fixture provenance.",
    inputSchema: settings, annotations: readOnly,
  }, (body) => call("/api/taste/preview", body));
  return {
    server,
    async close() { await server.close(); await new Promise((resolve) => backend.close(resolve)); },
  };
}

async function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  process.chdir(root);
  const { config } = await import("dotenv");
  config({ path: path.join(root, ".env"), quiet: true });
  const release = await activateConfiguredTransport(root, process.env);
  const agent = await createAgentServer({ env: process.env });
  agent.server.server.onclose = async () => { await release(); process.exit(0); };
  await agent.server.connect(new StdioServerTransport());
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => { console.error("The agent tool server could not start. Check local configuration."); process.exitCode = 1; });
