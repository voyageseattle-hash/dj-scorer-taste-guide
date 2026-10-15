import type {
  QlooWorkflowExecutor,
  CreateDirectQlooWorkflowExecutorFromEnvironmentOptions,
} from "@qloo/qloo-harness";
import {
  classifyMusicGenre,
  genreLabel,
  type MusicGenre,
  type TasteArtist,
} from "../src/lib/tasteTypes";
import { qlooReadiness, QlooCallBudget, TasteServiceError } from "./qlooAccess";

export interface CulturalTag {
  id: string;
  name: string;
  genre: MusicGenre;
  affinity: number | null;
}
export const QLOO_EVENT_BASE_URL = "https://hackathon.api.qloo.com";
export interface TasteProvider {
  mode: "qloo" | "offline_fixture";
  findTags(genre: MusicGenre): Promise<CulturalTag[]>;
  recommend(tag: CulturalTag): Promise<TasteArtist[]>;
  artistTags(artists: TasteArtist[]): Promise<CulturalTag[]>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const affinity = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
function resultRows(result: Record<string, unknown>) {
  if (
    result.schema_version !== "1.0-preview.1" ||
    !["ok", "empty"].includes(String(result.status)) ||
    !Array.isArray(result.results)
  )
    throw new TasteServiceError(
      "QLOO_CONTRACT",
      "Qloo returned a result that needs review. No substitute data was used.",
    );
  return result.results as Record<string, unknown>[];
}
function musicTags(rows: Record<string, unknown>[]): CulturalTag[] {
  return rows
    .flatMap((row) => {
      const id = String(row.id || "");
      const name = String(row.name || "").slice(0, 100);
      const genre = classifyMusicGenre(name);
      if (
        !genre ||
        id.length > 200 ||
        !id.startsWith("urn:tag:") ||
        !/music/i.test(id + " " + String(row.type || ""))
      )
        return [];
      return [{ id, name, genre, affinity: affinity(row.affinity) }];
    })
    .slice(0, 12);
}
function providerError(error: unknown): TasteServiceError {
  if (error instanceof TasteServiceError) return error;
  const reported = String((error as { code?: unknown })?.code || "");
  const code = [
    "QLOO_AUTH",
    "QLOO_RATE_LIMIT",
    "QLOO_DNS",
    "QLOO_CONNECT",
    "QLOO_TIMEOUT",
    "QLOO_TLS",
    "QLOO_CONTRACT",
    "QLOO_UPSTREAM",
    "CANCELLED",
  ].includes(reported)
    ? reported
    : "QLOO_UPSTREAM";
  if (code === "QLOO_AUTH")
    return new TasteServiceError(
      code,
      "Qloo rejected the event credential. Ask the operator to check access.",
    );
  if (code === "QLOO_RATE_LIMIT")
    return new TasteServiceError(
      code,
      "Qloo's request limit was reached. Try again later.",
      429,
    );
  return new TasteServiceError(
    code,
    "Qloo could not complete this request. No substitute results were generated.",
  );
}

export class HarnessTasteProvider implements TasteProvider {
  mode = "qloo" as const;
  private executor?: QlooWorkflowExecutor;
  constructor(
    private env: NodeJS.ProcessEnv,
    private budget: QlooCallBudget,
    private loadExecutor?: (
      options: CreateDirectQlooWorkflowExecutorFromEnvironmentOptions,
    ) => Promise<QlooWorkflowExecutor>,
  ) {}
  private async execute(
    operation: "find_tags" | "recommend" | "entity_tags",
    input: any,
  ) {
    if (qlooReadiness(this.env).state !== "ready")
      throw new TasteServiceError(
        "QLOO_NOT_CONFIGURED",
        "Live Qloo access is not configured. Try the labeled offline example.",
      );
    try {
      if (!this.executor) {
        const executorOptions = {
          env: {
            QLOO_API_KEY: this.env.QLOO_API_KEY,
            QLOO_BASE_URL: QLOO_EVENT_BASE_URL,
            QLOO_TRUSTED_BASE_URL: QLOO_EVENT_BASE_URL,
          },
          readConfigFile: () => "{}",
          executionObserver: {},
        };
        if (this.loadExecutor)
          this.executor = await this.loadExecutor(executorOptions);
        else {
          const { createDirectQlooWorkflowExecutorFromEnvironment } =
            await import("@qloo/qloo-harness");
          this.executor =
            createDirectQlooWorkflowExecutorFromEnvironment(executorOptions);
        }
      }
      if (!this.executor)
        throw new TasteServiceError(
          "QLOO_NOT_CONFIGURED",
          "The Qloo event credential is unavailable.",
        );
      // entity_tags hydrates each fresh UUID, then calls insights. The pinned
      // client can attempt every HTTP request up to three times.
      const requests =
        operation === "entity_tags" ? 1 + input.entities.length : 1;
      this.budget.reserve(requests * 3);
      const execution = await this.executor.execute(operation, input, {
        signal: AbortSignal.timeout(20000),
      });
      return resultRows(execution.result);
    } catch (error) {
      throw providerError(error);
    }
  }
  async findTags(genre: MusicGenre) {
    const rows = await this.execute("find_tags", {
      query: genreLabel(genre),
      semantic: false,
      limit: 5,
    });
    return musicTags(rows).filter((tag) => tag.genre === genre);
  }
  async recommend(tag: CulturalTag) {
    const rows = await this.execute("recommend", {
      target_type: "artist",
      signal_tags: [tag.id],
      explain: true,
      limit: 4,
    });
    return rows.flatMap((row) => {
      const id = String(row.entity_id || ""),
        name = String(row.name || "").slice(0, 120);
      if (
        !uuid.test(id) ||
        !name ||
        ((row.subtype ?? row.type) != null && (row.subtype ?? row.type) !== "urn:entity:artist") ||
        (row.type != null && row.type !== "urn:entity" && row.type !== "urn:entity:artist")
      )
        return [];
      return [{ id, name, affinity: affinity(row.affinity) }];
    });
  }
  async artistTags(artists: TasteArtist[]) {
    if (!artists.length) return [];
    return musicTags(
      await this.execute("entity_tags", {
        entities: artists.slice(0, 2).map((artist) => artist.id),
        entity_type: "artist",
        limit: 12,
      }),
    );
  }
}
