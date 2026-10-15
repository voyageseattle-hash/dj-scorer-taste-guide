import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "release-manifest.json"), "utf8"));
const approved = new Set(manifest.files);
const files = [];
const failures = [];
function visit(folder) {
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(item.name) && item.isDirectory()) continue;
    const full = path.join(folder, item.name);
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (item.isSymbolicLink()) { failures.push({ file: relative, issue: "symbolic link" }); continue; }
    if (item.isDirectory()) visit(full);
    else files.push(relative);
  }
}
visit(root);
for (const file of files) {
  if (!approved.has(file)) failures.push({ file, issue: "not in reviewed publication manifest" });
  if (/^(?:data|artifacts|private|uploads|recordings|stores|\.qloo)\//i.test(file) || (/^\.env(?:\.|$)/i.test(file) && file !== ".env.example") || /firebase|credentials|service.account/i.test(file))
    failures.push({ file, issue: "private file category" });
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (/\0/.test(text)) failures.push({ file, issue: "unexpected binary asset" });
  if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[0-9A-Za-z_-]{30,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
    failures.push({ file, issue: "credential-shaped value" });
  if (/postgres(?:ql)?:\/\/[^/\s:@]+:[^@\s]+@/i.test(text))
    failures.push({ file, issue: "database credential literal" });
  for (const assignment of text.matchAll(/QLOO_API_KEY\s*[:=]\s*["']([^"']+)["']/g))
    if (assignment[1] !== "offline-fixture-only") failures.push({ file, issue: "non-fixture key literal" });
  if (file.startsWith("src/") && /QLOO_API_KEY|VITE_.*(?:KEY|SECRET)|firebase|stripe/i.test(text))
    failures.push({ file, issue: "server credential or excluded service reference in client" });
  if (/[A-Za-z]:[\\/](?:Users|Documents|Downloads)[\\/]|aistudio\.google\.com\/apps\/[a-f0-9-]{36}/i.test(text))
    failures.push({ file, issue: "private workstation or original-service identifier" });
}
for (const file of approved) if (!files.includes(file)) failures.push({ file, issue: "missing approved file" });
process.stdout.write(JSON.stringify({ passed: failures.length === 0, sourceFileCount: files.length, failures, note: "Pattern and explicit-scope scan; no private credential values were loaded." }, null, 2) + "\n");
if (failures.length) process.exitCode = 1;
