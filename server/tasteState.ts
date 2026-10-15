import { randomUUID } from "node:crypto";
import { TasteServiceError } from "./qlooAccess";
import type { CulturalTag } from "./tasteProvider";
import { MUSIC_GENRES } from "../src/lib/tasteTypes";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const lifetime = 20 * 60000;
type Choice = { token: string; label: string; genre: CulturalTag["genre"] };
export interface TasteState {
  session(candidate?: string): Promise<{ uid: string; created: boolean }>;
  issueChoices(uid: string, tags: CulturalTag[]): Promise<Choice[]>;
  choice(uid: string, token: unknown): Promise<CulturalTag | undefined>;
}
type Database = { query(sql: string, values?: unknown[]): Promise<{ rows: any[] }> };
const unavailable = () => new TasteServiceError("TASTE_STATE", "The taste guide's session storage is unavailable. Try again later.");
const busy = () => new TasteServiceError("TASTE_BUSY", "The taste guide is busy. Try again shortly.", 429);
function canonicalTag(value: any): CulturalTag {
  if (!value || typeof value.id !== "string" || value.id.length > 200 ||
      !(value.id.startsWith("urn:tag:") || /^fixture:tag:(?:house|garage)$/.test(value.id)) ||
      typeof value.name !== "string" || !value.name || value.name.length > 100 ||
      !MUSIC_GENRES.some((genre) => genre.id === value.genre) ||
      !(value.affinity === null || (typeof value.affinity === "number" && Number.isFinite(value.affinity)))) throw unavailable();
  return { id: value.id, name: value.name, genre: value.genre, affinity: value.affinity };
}

// Local HTTP/MCP mode only. Netlify live mode requires the Postgres implementation.
export function createMemoryTasteState(now = () => Date.now()): TasteState {
  const sessions = new Map<string, number>();
  const choices = new Map<string, { uid: string; tag: CulturalTag; expires: number }>();
  function prune() {
    for (const [id, expires] of sessions) if (expires <= now()) sessions.delete(id);
    for (const [token, choice] of choices) if (choice.expires <= now() || !sessions.has(choice.uid)) choices.delete(token);
  }
  return {
    async session(candidate) {
      prune();
      if (candidate && sessions.has(candidate)) return { uid: candidate, created: false };
      if (sessions.size >= 10000) throw busy();
      const uid = randomUUID();
      sessions.set(uid, now() + lifetime);
      return { uid, created: true };
    },
    async issueChoices(uid, tags) {
      prune();
      // A local route may use an injected authenticator instead of session().
      if (!sessions.has(uid)) sessions.set(uid, now() + lifetime);
      if (choices.size + tags.length > 5000) throw busy();
      return tags.map((value) => {
        const token = randomUUID();
        const tag = canonicalTag(value);
        choices.set(token, { uid, tag, expires: now() + lifetime });
        return { token, label: tag.name, genre: tag.genre };
      });
    },
    async choice(uid, token) {
      prune();
      const value = typeof token === "string" ? choices.get(token) : undefined;
      return value?.uid === uid ? value.tag : undefined;
    },
  };
}

export async function createPostgresTasteState(database: Database): Promise<TasteState> {
  async function query(sql: string, values?: unknown[]) {
    try { return await database.query(sql, values); }
    catch { throw unavailable(); }
  }
  await query(`CREATE TABLE IF NOT EXISTS taste_sessions (
    id UUID PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL
  )`);
  await query(`CREATE TABLE IF NOT EXISTS taste_choices (
    token UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES taste_sessions(id) ON DELETE CASCADE,
    tag JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  return {
    async session(candidate) {
      if (candidate && uuid.test(candidate)) {
        const existing = await query("SELECT id FROM taste_sessions WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP", [candidate]);
        if (existing.rows.length) return { uid: existing.rows[0].id, created: false };
      }
      await query("DELETE FROM taste_sessions WHERE expires_at <= CURRENT_TIMESTAMP");
      const uid = randomUUID();
      const inserted = await query(`INSERT INTO taste_sessions (id, expires_at)
        SELECT $1, CURRENT_TIMESTAMP + INTERVAL '20 minutes'
        WHERE (SELECT COUNT(*) FROM taste_sessions) < 10000 RETURNING id`, [uid]);
      if (!inserted.rows.length) throw busy();
      return { uid, created: true };
    },
    async issueChoices(uid, tags) {
      if (!uuid.test(uid) || tags.length > 12) throw unavailable();
      if (!tags.length) return [];
      const records = tags.map((tag) => ({ token: randomUUID(), tag: canonicalTag(tag) }));
      await query("DELETE FROM taste_choices WHERE expires_at <= CURRENT_TIMESTAMP");
      const inserted = await query(`INSERT INTO taste_choices (token, session_id, tag, expires_at)
        SELECT item.token::UUID, $1, item.tag, CURRENT_TIMESTAMP + INTERVAL '20 minutes'
        FROM jsonb_to_recordset($2::JSONB) AS item(token TEXT, tag JSONB)
        WHERE EXISTS (SELECT 1 FROM taste_sessions WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP)
        AND (SELECT COUNT(*) FROM taste_choices) + $3 <= 5000 RETURNING token, tag`, [uid, JSON.stringify(records), records.length]);
      if (inserted.rows.length !== records.length) throw busy();
      return inserted.rows.map((row) => {
        const tag = canonicalTag(row.tag);
        return { token: row.token, label: tag.name, genre: tag.genre };
      });
    },
    async choice(uid, token) {
      if (!uuid.test(uid) || typeof token !== "string" || !uuid.test(token)) return undefined;
      const result = await query(`SELECT c.tag FROM taste_choices c JOIN taste_sessions s ON s.id = c.session_id
        WHERE c.token = $1 AND c.session_id = $2 AND c.expires_at > CURRENT_TIMESTAMP AND s.expires_at > CURRENT_TIMESTAMP`, [token, uid]);
      return result.rows.length ? canonicalTag(result.rows[0].tag) : undefined;
    },
  };
}
