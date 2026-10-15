import serverless from "serverless-http";
import { createDemoApp } from "../../server/demoApp.mjs";
import { createConfiguredRuntime } from "../../server/configuredRuntime.mjs";
import builtContext from "../deploy-context.json" with { type: "json" };

// Each container initializes once. Sessions, choices and actual-HTTP allowance
// are shared in Postgres; no process-local state is needed for live continuity.
export function createNetlifyHandler({ env = process.env, initialize = createConfiguredRuntime, provider, deploymentContext = builtContext.context } = {}) {
  let initialized;
  return async (event, context = {}) => {
    context.callbackWaitsForEmptyEventLoop = false;
    try {
      if (!initialized) initialized = (async () => {
        if (env.QLOO_ENABLED === "true" &&
            (deploymentContext !== "production" || env.QLOO_EVENT_DEMO_OPERATOR_APPROVED !== "true" ||
             env.QLOO_OPERATOR_APPROVED !== "true" || env.QLOO_BUDGET_BACKEND !== "postgres"))
          throw new Error("Live function configuration is incomplete.");
        const runtime = await initialize(process.cwd(), env);
        if (env.QLOO_ENABLED === "true" && !runtime.state) throw new Error("Durable state is required.");
        try {
          return serverless(createDemoApp({ env: { ...env, NODE_ENV: "production" }, state: runtime.state, provider, usageFilename: null }));
        } catch (error) { await runtime.release(); throw error; }
      })().catch((error) => { initialized = undefined; throw error; });
      const adapter = await initialized;
      // Accept the documented rewrite and direct function path consistently.
      let requestPath = event.path || "/";
      const prefix = "/.netlify/functions/api";
      if (requestPath === prefix || requestPath.startsWith(prefix + "/")) {
        requestPath = requestPath.slice(prefix.length) || "/";
        if (requestPath.startsWith("/taste/")) requestPath = "/api" + requestPath;
      }
      return await adapter({ ...event, path: requestPath }, context);
    } catch {
      // A failed cold start may retry initialization later, never bypass it.
      // An active adapter stays cached, avoiding a second global fetch wrapper.
      return { statusCode: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ code: "TASTE_UNAVAILABLE", error: "The taste guide is unavailable. Live requests remain stopped." }) };
    }
  };
}

export const handler = createNetlifyHandler();
