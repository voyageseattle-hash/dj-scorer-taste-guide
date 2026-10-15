import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoApp } from "./server/demoApp.mjs";
import { createConfiguredRuntime } from "./server/configuredRuntime.mjs";
export { createDemoApp };
const root = fileURLToPath(new URL("./", import.meta.url));
async function start() {
  process.chdir(root);
  const { config } = await import("dotenv");
  config({ path: path.join(root, ".env"), quiet: true });
  const env = process.env;
  const runtime = await createConfiguredRuntime(root, env);
  const app = createDemoApp({ env, state: runtime.state, ...(runtime.state ? { usageFilename: null } : {}) });
  if (env.NODE_ENV === "production") {
    app.use(express.static(path.join(root, "dist"), { dotfiles: "deny", index: false }));
    app.get("*", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ root, server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  app.use((_error, _req, res, _next) => res.status(400).json({ error: "The request could not be processed." }));
  app.listen(Number(env.PORT || 3000), env.HOST || "127.0.0.1", () => console.log("DJ Scorer Taste guide is running."));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  start().catch(() => { console.error("The demo could not start. Check server configuration; no credential values were logged."); process.exitCode = 1; });
export { start };
