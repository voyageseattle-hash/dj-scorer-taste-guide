import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
// CONTEXT is provided at build time, not in the Functions runtime. Stamp only
// that nonsecret fact into the server bundle; never serialize process.env.
const context = process.env.CONTEXT === "production" ? "production" : "nonproduction";
fs.writeFileSync(new URL("../netlify/deploy-context.json", import.meta.url), JSON.stringify({ context }) + "\n");
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "build"], { cwd: root, stdio: "inherit" });
if (result.error) throw new Error("The frontend build could not start.");
process.exitCode = result.status ?? 1;
