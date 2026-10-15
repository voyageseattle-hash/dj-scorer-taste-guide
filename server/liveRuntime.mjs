import fs from "node:fs";
import path from "node:path";
import { qlooReadiness } from "./qlooAccess.ts";
import { createValidationTransport } from "../scripts/qloo-validation-transport.mjs";

// Shared by HTTP and stdio entry points. A lock prevents concurrent processes
// from racing the same durable five-attempt counter. No raw key is stored.
export function activateLiveTransport(root, env) {
  if (env.QLOO_ENABLED !== "true" || env.QLOO_OPERATOR_APPROVED !== "true") return () => {};
  if (env.NODE_ENV === "production" && env.QLOO_PERSISTENT_STORAGE_CONFIRMED !== "true")
    throw new Error("A durable data mount must be confirmed before production live mode.");
  if (qlooReadiness(env).state !== "ready") throw new Error("Live access prerequisites are incomplete.");
  if (!/^\d+$/.test(env.QLOO_PRIOR_HTTP_ATTEMPTS || "")) throw new Error("Prior HTTP usage must be explicitly configured.");
  const priorUsed = Number(env.QLOO_PRIOR_HTTP_ATTEMPTS);
  if (!Number.isSafeInteger(priorUsed) || priorUsed < 0 || priorUsed > 1e9) throw new Error("Invalid prior HTTP usage.");
  const directory = path.join(root, "data");
  fs.mkdirSync(directory, { recursive: true });
  const countFile = path.join(directory, "qloo-request-count.json");
  const lockFile = path.join(directory, "qloo-live.lock");
  const lock = fs.openSync(lockFile, "wx");
  const nativeFetch = globalThis.fetch;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    globalThis.fetch = nativeFetch;
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
  };
  try {
    const stored = fs.existsSync(countFile) ? JSON.parse(fs.readFileSync(countFile, "utf8")) : {};
    const storedUsed = stored.outboundAttempts ?? 0;
    if (!Number.isSafeInteger(storedUsed) || storedUsed < 0) throw new Error("Invalid stored HTTP usage.");
    const initial = { ...stored, outboundAttempts: Math.max(storedUsed, priorUsed) };
    const transport = createValidationTransport({
      fetchImpl: nativeFetch, initial,
      cap: Math.min(5, Number(env.QLOO_EVENT_QUOTA)),
      persist(state) { fs.writeFileSync(countFile, JSON.stringify(state)); },
    });
    // Seed prior usage before enabling dispatch, even if this process never
    // makes a request. A smaller later configuration cannot erase that usage.
    fs.writeFileSync(countFile, JSON.stringify(transport.snapshot()));
    globalThis.fetch = transport.fetch;
    process.once("exit", release);
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
