import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { TasteStatus } from "../src/lib/tasteTypes";

export class TasteServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export function qlooReadiness(
  env: NodeJS.ProcessEnv,
  now = Date.now(),
): TasteStatus {
  const missing: string[] = [];
  if (!env.QLOO_API_KEY?.trim()) missing.push("QLOO_API_KEY");
  if (env.QLOO_ENABLED !== "true") missing.push("QLOO_ENABLED");
  if (env.QLOO_FREE_ACCESS_CONFIRMED !== "true")
    missing.push("QLOO_FREE_ACCESS_CONFIRMED");
  if (env.QLOO_HOSTING_PERMITTED_CONFIRMED !== "true")
    missing.push("QLOO_HOSTING_PERMITTED_CONFIRMED");
  for (const name of ["QLOO_EVENT_QUOTA", "QLOO_EVENT_RATE_PER_MINUTE"])
    if (!/^[1-9]\d*$/.test(env[name] || "")) missing.push(name);
  const expiry = Date.parse(env.QLOO_ACCESS_EXPIRES_AT || "");
  if (!Number.isFinite(expiry) || expiry <= now)
    missing.push("QLOO_ACCESS_EXPIRES_AT");
  return {
    state: missing.length ? "disconnected" : "ready",
    credentialConfigured: Boolean(env.QLOO_API_KEY?.trim()),
    missing,
    message: missing.length
      ? "Live taste search is not configured. The offline example is available."
      : "Qloo access is configured. Live requests are enabled.",
    offlineExampleAvailable: true,
  };
}

// Reserves worst-case HTTP attempts for the pinned SDK, including hydration and
// its maximum three attempts per request. This is not a measured vendor usage total.
export class QlooCallBudget {
  private used = 0;
  private recent: number[] = [];
  private fingerprint: string;
  constructor(
    private env: NodeJS.ProcessEnv,
    private filename?: string,
    private now = () => Date.now(),
  ) {
    this.fingerprint = createHash("sha256")
      .update(env.QLOO_API_KEY || "")
      .digest("hex");
    if (filename && fs.existsSync(filename)) {
      try {
        const stored = JSON.parse(fs.readFileSync(filename, "utf8"));
        if (stored.fingerprint === this.fingerprint) {
          if (
            !Number.isInteger(stored.used) ||
            stored.used < 0 ||
            !Array.isArray(stored.recent)
          )
            throw new Error("Invalid usage file");
          this.used = stored.used;
          this.recent = stored.recent.filter(
            (time: unknown) =>
              typeof time === "number" && Number.isFinite(time),
          );
        }
      } catch {
        throw new TasteServiceError(
          "QLOO_USAGE",
          "Qloo usage tracking needs an operator review before live calls.",
        );
      }
    }
  }
  reserve(attempts = 1) {
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 30)
      throw new TasteServiceError(
        "QLOO_BUDGET",
        "The Qloo request budget needs review.",
      );
    if (qlooReadiness(this.env, this.now()).state !== "ready")
      throw new TasteServiceError(
        "QLOO_NOT_CONFIGURED",
        "Live Qloo access is not configured or has expired.",
      );
    const quota = Math.min(Number(this.env.QLOO_EVENT_QUOTA), 200);
    const rate = Math.min(Number(this.env.QLOO_EVENT_RATE_PER_MINUTE), 30);
    const now = this.now();
    this.recent = this.recent.filter((time) => now - time < 60000);
    if (this.used + attempts > quota)
      throw new TasteServiceError(
        "QLOO_QUOTA",
        "The app's Qloo request budget is exhausted. Ask the operator to review event usage.",
        429,
      );
    if (this.recent.length + attempts > rate)
      throw new TasteServiceError(
        "QLOO_RATE_LIMIT",
        "Taste search is taking a short pause. Try again shortly.",
        429,
      );
    this.used += attempts;
    // Every workflow has a 20-second signal; retaining reservations through that
    // window conservatively covers requests made near a rate-window boundary.
    this.recent.push(...Array(attempts).fill(now + 20000));
    if (this.filename) {
      fs.mkdirSync(path.dirname(this.filename), { recursive: true });
      const temporary = this.filename + ".tmp";
      fs.writeFileSync(
        temporary,
        JSON.stringify({
          fingerprint: this.fingerprint,
          used: this.used,
          recent: this.recent,
        }),
      );
      fs.renameSync(temporary, this.filename);
    }
  }
}
