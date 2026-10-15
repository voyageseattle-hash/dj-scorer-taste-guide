import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { verifyRequest, type Identity } from "./auth";
import { qlooReadiness, QlooCallBudget, TasteServiceError } from "./qlooAccess";
import {
  HarnessTasteProvider,
  type CulturalTag,
  type TasteProvider,
} from "./tasteProvider";
import { createTastePlan, type ListingInput } from "./tastePlanner";
import {
  exampleTag,
  fixtureTasteProvider,
  fixtureListings,
} from "./tasteFixtures";
import {
  MUSIC_GENRES,
  TASTE_GOALS,
  type MusicGenre,
  type TasteGoal,
} from "../src/lib/tasteTypes";
import { REGION_NAMES, localDateKey } from "../src/lib/regions";

export interface TasteRouteOptions {
  env?: NodeJS.ProcessEnv;
  provider?: TasteProvider;
  authenticate?: (req: Request, res: Response) => Promise<Identity | null>;
  listings?: () => ListingInput[];
}
const validDate = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
function planSettings(body: Record<string, unknown>) {
  const goal = TASTE_GOALS.find((item) => item.id === body.goal)?.id;
  const region =
    typeof body.region === "string" && Object.hasOwn(REGION_NAMES, body.region)
      ? body.region
      : null;
  if (!goal || !region || !validDate(body.today))
    throw new TasteServiceError(
      "TASTE_INPUT",
      "Choose a goal, region, and valid calendar date.",
      400,
    );
  return { goal: goal as TasteGoal, region, today: body.today as string };
}
function allowedBody(
  body: unknown,
  keys: string[],
): asserts body is Record<string, unknown> {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !keys.includes(key))
  )
    throw new TasteServiceError(
      "TASTE_INPUT",
      "Use the taste guide controls to make this request.",
      400,
    );
}
export function registerTasteRoutes(
  app: Express,
  firebaseApiKey?: string,
  options: TasteRouteOptions = {},
) {
  const env = options.env || process.env;
  const authenticate =
    options.authenticate ||
    ((req, res) => verifyRequest(req, res));
  const choices = new Map<
    string,
    { uid: string; tag: CulturalTag; expires: number }
  >();
  let liveProvider = options.provider;
  const getProvider = () => {
    if (qlooReadiness(env).state !== "ready")
      throw new TasteServiceError(
        "QLOO_NOT_CONFIGURED",
        "Live Qloo access is not configured. Try the labeled offline example.",
      );
    if (!liveProvider)
      liveProvider = new HarnessTasteProvider(
        env,
        new QlooCallBudget(
          env,
          path.join(process.cwd(), "data", "qloo-usage.json"),
        ),
      );
    return liveProvider;
  };
  const listings =
    options.listings ||
    (() => {
      const filename = path.join(process.cwd(), "data", "events-cache.json");
      if (!fs.existsSync(filename)) return [];
      const catalog = JSON.parse(fs.readFileSync(filename, "utf8"));
      if (!Array.isArray(catalog.events)) return [];
      return catalog.events
        .filter(
          (event: any) =>
            typeof event.title === "string" &&
            typeof event.location === "string" &&
            validDate(event.date) &&
            Array.isArray(event.tags),
        )
        .slice(0, 5000);
    });
  const respondError = (res: Response, error: unknown) => {
    const known =
      error instanceof TasteServiceError
        ? error
        : new TasteServiceError(
            "TASTE_SERVICE",
            "The taste guide could not finish. Try again later.",
          );
    res.status(known.status).json({ error: known.message, code: known.code });
  };
  app.get("/api/taste/status", (req, res) => res.json(qlooReadiness(env)));
  app.post("/api/taste/tags", async (req, res) => {
    const identity = await authenticate(req, res);
    if (!identity) return;
    try {
      allowedBody(req.body, ["genre"]);
      const genre = MUSIC_GENRES.find((item) => item.id === req.body.genre)
        ?.id as MusicGenre | undefined;
      if (!genre)
        throw new TasteServiceError(
          "TASTE_INPUT",
          "Choose one of the music genres in the guide.",
          400,
        );
      const now = Date.now();
      for (const [token, value] of choices)
        if (value.expires <= now) choices.delete(token);
      if (choices.size > 5000)
        throw new TasteServiceError(
          "TASTE_BUSY",
          "The taste guide is busy. Try again shortly.",
          429,
        );
      const tags = await getProvider().findTags(genre);
      const result = tags.map((tag) => {
        const token = randomUUID();
        choices.set(token, {
          uid: identity.uid,
          tag,
          expires: now + 20 * 60000,
        });
        return { token, label: tag.name, genre: tag.genre };
      });
      res.json({ source: "qloo", choices: result });
    } catch (error) {
      respondError(res, error);
    }
  });
  app.post("/api/taste/plan", async (req, res) => {
    const identity = await authenticate(req, res);
    if (!identity) return;
    try {
      allowedBody(req.body, ["choiceToken", "goal", "region", "today"]);
      const settings = planSettings(req.body);
      const choice =
        typeof req.body.choiceToken === "string"
          ? choices.get(req.body.choiceToken)
          : undefined;
      if (
        !choice ||
        choice.uid !== identity.uid ||
        choice.expires <= Date.now()
      )
        throw new TasteServiceError(
          "TASTE_CHOICE",
          "Search again and confirm the music tag you want to use.",
          400,
        );
      const plan = await createTastePlan(
        getProvider(),
        choice.tag,
        settings.goal,
        settings.region,
        settings.today,
        listings(),
      );
      res.json(plan);
    } catch (error) {
      respondError(res, error);
    }
  });
  app.post("/api/taste/preview", async (req, res) => {
    try {
      allowedBody(req.body, ["goal", "region", "today"]);
      const settings = planSettings(req.body);
      res.json(
        await createTastePlan(
          fixtureTasteProvider(),
          exampleTag,
          settings.goal,
          settings.region,
          settings.today,
          fixtureListings(settings.today, settings.region),
        ),
      );
    } catch (error) {
      respondError(res, error);
    }
  });
}
