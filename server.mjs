import express from "express";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { registerTasteRoutes } from "./server/tasteRoutes.ts";
import { activateConfiguredTransport } from "./server/configuredRuntime.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
export function createDemoApp({ env = {}, provider, listings = () => [] } = {}) {
  const app = express();
  const sessions = new Map();
  let minuteStart = Date.now();
  let minuteRequests = 0;
  const effectiveEnv = { ...env, QLOO_ENABLED: env.QLOO_OPERATOR_APPROVED === "true" ? env.QLOO_ENABLED : "false" };
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" });
    if (env.NODE_ENV === "production") res.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
    let requested;
    try { requested = path.posix.normalize(decodeURIComponent(req.path).replaceAll("\\", "/")); }
    catch { return res.status(400).json({ error: "Invalid path." }); }
    if (/(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|data|artifacts|server|scripts)(?:\/|$)/i.test(requested))
      return res.status(404).json({ error: "This file is not publicly available." });
    next();
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (Date.now() - minuteStart >= 60000) { minuteStart = Date.now(); minuteRequests = 0; }
    if (++minuteRequests > 120) return res.status(429).json({ error: "The demo is busy. Try again in a minute." });
    if (req.method === "POST" && req.get("origin") && req.get("origin") !== (env.APP_URL || env.RENDER_EXTERNAL_URL || "http://localhost:3000"))
      return res.status(403).json({ error: "Use the demo on its own website." });
    next();
  });
  app.use(express.json({ limit: "2kb" }));
  const authenticate = async (req, res) => {
    const now = Date.now();
    for (const [id, expires] of sessions) if (expires <= now) sessions.delete(id);
    let uid = req.get("cookie")?.match(/(?:^|;\s*)dj_taste_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
    if (!uid || !sessions.has(uid)) {
      if (sessions.size >= 10000) { res.status(429).json({ error: "The demo is busy." }); return null; }
      uid = randomUUID();
      sessions.set(uid, now + 20 * 60000);
      res.append("Set-Cookie", `dj_taste_session=${uid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1200${env.NODE_ENV === "production" ? "; Secure" : ""}`);
    }
    return { uid, email: "", verified: true, token: "", admin: false };
  };
  registerTasteRoutes(app, undefined, { env: effectiveEnv, provider, authenticate, listings });
  app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown API route." }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/about", (_req, res) => res.type("html").send("<!doctype html><html lang='en'><title>About DJ Scorer Taste guide</title><meta name='viewport' content='width=device-width'><body><h1>From taste to practice</h1><p>This focused Qloo module builds on a pre-existing DJ Scorer prototype. The Qloo workflow was added October 13–14, 2026; adapter fixes and this standalone extraction followed October 15.</p><p>The offline example uses invented artists and fictional venues. It makes no provider requests. Live mode uses Qloo cultural relationships and a separate DJ Scorer practice planner. Affinities are aggregate relationships, not personal predictions.</p><p>No recordings, payments, Firebase services, real event datasets, or private account data are included in this demo.</p><a href='/'>Back to the guide</a></body></html>"));
  return app;
}

async function start() {
  process.chdir(root);
  const { config } = await import("dotenv");
  config({ path: path.join(root, ".env"), quiet: true });
  const env = process.env;
  await activateConfiguredTransport(root, env);
  const app = createDemoApp({ env });
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
