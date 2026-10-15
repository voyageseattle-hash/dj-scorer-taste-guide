import assert from "node:assert/strict";
import { createDirectQlooWorkflowExecutor } from "@qloo/qloo-harness";
import { HarnessTasteProvider } from "../server/tasteProvider.ts";
import { qlooReadiness, QlooCallBudget } from "../server/qlooAccess.ts";
import express from "express";
import { once } from "node:events";
import { registerTasteRoutes } from "../server/tasteRoutes.ts";
import { createTastePlan, mentionsArtistName } from "../server/tastePlanner.ts";
import {
  fixtureTasteProvider,
  exampleTag,
  fixtureListings,
} from "../server/tasteFixtures.ts";

const env = {
  QLOO_API_KEY: "offline-fixture-only",
  QLOO_ENABLED: "true",
  QLOO_FREE_ACCESS_CONFIRMED: "true",
  QLOO_HOSTING_PERMITTED_CONFIRMED: "true",
  QLOO_EVENT_QUOTA: "50",
  QLOO_EVENT_RATE_PER_MINUTE: "20",
  QLOO_ACCESS_EXPIRES_AT: "2099-01-01T00:00:00Z",
};
const requests = [];
const tag = {
  tag_id: "urn:tag:genre:music:house",
  name: "House",
  type: "urn:tag:genre:music",
  affinity: 0.8,
};
const artist = {
  entity_id: "11111111-1111-4111-8111-111111111111",
  name: "Fixture Artist",
  type: "urn:entity:artist",
  query: { affinity: 0.7 },
};
const secondArtist = {
  ...artist,
  entity_id: "22222222-2222-4222-8222-222222222222",
  name: "Second Fixture Artist",
};
const client = {
  tags: async (query) => {
    requests.push({ operation: "tags", query });
    return { results: { tags: [tag] } };
  },
  insights: async (query) => {
    requests.push({ operation: "insights", query });
    return {
      results:
        query["filter.type"] === "urn:tag"
          ? { tags: [tag] }
          : { entities: [artist, secondArtist] },
    };
  },
  searchEntities: async () => {
    throw new Error(
      "Unexpected name resolution: user-confirmed identifiers must be retained.",
    );
  },
  entities: async (ids) => {
    requests.push({ operation: "entities", ids });
    return {
      results: {
        entities: [artist, secondArtist].filter((item) =>
          ids.includes(item.entity_id),
        ),
      },
    };
  },
};
const executor = createDirectQlooWorkflowExecutor(client, {});
let capturedExecutorOptions;
const provider = new HarnessTasteProvider(
  env,
  new QlooCallBudget(env),
  async (options) => {
    capturedExecutorOptions = options;
    return executor;
  },
);
const tags = await provider.findTags("house");
assert.deepEqual(Object.keys(capturedExecutorOptions.env).sort(), [
  "QLOO_API_KEY",
  "QLOO_BASE_URL",
  "QLOO_TRUSTED_BASE_URL",
]);
assert.equal(
  capturedExecutorOptions.env.QLOO_BASE_URL,
  "https://hackathon.api.qloo.com",
);
assert.equal(
  capturedExecutorOptions.env.QLOO_TRUSTED_BASE_URL,
  "https://hackathon.api.qloo.com",
);
assert.equal(capturedExecutorOptions.readConfigFile("ignored"), "{}");
assert.equal(tags[0].genre, "house");
assert.equal(requests.length, 1);
const artists = await provider.recommend(tags[0]);
assert.equal(artists[0].name, "Fixture Artist");
assert.equal(requests.length, 2);
assert.equal((await provider.artistTags(artists))[0].genre, "house");
assert.equal(requests.length, 5);
assert.equal(
  requests.filter((request) => request.operation === "entities").length,
  2,
);
assert.equal(requests[1].query["filter.type"], "urn:entity:artist");
assert.deepEqual(requests[1].query["signal.interests.tags"], [tag.tag_id]);
assert.equal(requests[4].query["filter.type"], "urn:tag");
assert.ok(!JSON.stringify(requests).includes(env.QLOO_API_KEY));
assert.equal(qlooReadiness({}).state, "disconnected");
console.log(
  "PASS Canonical Qloo SDK workflows and app adapter with an in-memory fixture client. Zero live requests.",
);

let loadedWhileMissing = false;
const disconnected = new HarnessTasteProvider(
  {},
  new QlooCallBudget({}),
  async () => {
    loadedWhileMissing = true;
    return executor;
  },
);
await assert.rejects(
  () => disconnected.findTags("house"),
  (error) => error.code === "QLOO_NOT_CONFIGURED",
);
assert.equal(loadedWhileMissing, false);
assert.equal(
  qlooReadiness({ QLOO_API_KEY: "offline-fixture-only" }).state,
  "disconnected",
);
assert.equal(
  qlooReadiness(env, Date.parse("2100-01-01T00:00:00Z")).state,
  "disconnected",
);
const quotaBudget = new QlooCallBudget({ ...env, QLOO_EVENT_QUOTA: "15" });
quotaBudget.reserve(3);
quotaBudget.reserve(3);
quotaBudget.reserve(9);
assert.throws(
  () => quotaBudget.reserve(1),
  (error) => error.code === "QLOO_QUOTA",
);
let clock = Date.now();
const rateBudget = new QlooCallBudget(
  { ...env, QLOO_EVENT_RATE_PER_MINUTE: "3" },
  undefined,
  () => clock,
);
rateBudget.reserve(3);
assert.throws(
  () => rateBudget.reserve(1),
  (error) => error.code === "QLOO_RATE_LIMIT",
);
clock += 81000;
rateBudget.reserve(3);
console.log(
  "PASS Missing access, free-access confirmation, expiry, worst-case HTTP budget, and rate-window boundaries.",
);

const rejectedProvider = new HarnessTasteProvider(
  env,
  new QlooCallBudget(env),
  async () => ({
    execute: async () => {
      throw { code: "QLOO_AUTH", message: "Sensitive provider detail" };
    },
  }),
);
await assert.rejects(
  () => rejectedProvider.findTags("house"),
  (error) =>
    error.code === "QLOO_AUTH" &&
    !error.message.includes("Sensitive provider detail"),
);
const malformedProvider = new HarnessTasteProvider(
  env,
  new QlooCallBudget(env),
  async () => ({
    execute: async () => ({
      result: { schema_version: "unexpected", status: "ok", results: [] },
    }),
  }),
);
await assert.rejects(
  () => malformedProvider.findTags("house"),
  (error) => error.code === "QLOO_CONTRACT",
);
console.log(
  "PASS Provider failures are redacted and contract errors do not substitute fixture data.",
);

assert.equal(
  mentionsArtistName("Nondisclosure club night", "Disclosure"),
  false,
);
assert.equal(mentionsArtistName("Disclosure: Live", "Disclosure"), true);
const today = "2026-10-13";
const emptyArtistPlan = await createTastePlan(
  { ...fixtureTasteProvider(), recommend: async () => [] },
  exampleTag,
  "discover_scene",
  "SEA",
  today,
  fixtureListings(today, "SEA"),
);
assert.equal(emptyArtistPlan.artists.length, 0);
assert.ok(!emptyArtistPlan.practice.steps[0].includes("suggested artist"));
const regionalPlan = await createTastePlan(
  fixtureTasteProvider(),
  exampleTag,
  "build_energy",
  "SEA",
  today,
  [
    ...fixtureListings(today, "SEA"),
    {
      eventId: "past",
      title: "Past house event",
      location: "Example",
      date: "2026-10-12",
      region: "SEA",
      tags: ["house"],
    },
    {
      eventId: "wrong-region",
      title: "LA house event",
      location: "Example",
      date: today,
      region: "LA",
      tags: ["house"],
    },
  ],
);
assert.equal(regionalPlan.events.length, 2);
assert.equal(regionalPlan.mode, "offline_fixture");
assert.ok(regionalPlan.limitations.some((item) => item.includes("invented")));
assert.ok(regionalPlan.relatedGenres.includes("UK garage"));
const focusedPlan = await createTastePlan(
  {
    ...fixtureTasteProvider(),
    artistTags: async () => {
      throw new Error("Focused practice should not expand artist tags");
    },
  },
  exampleTag,
  "smooth_transitions",
  "SEA",
  today,
  [],
);
assert.equal(focusedPlan.calendarStatus, "empty");
console.log(
  "PASS Planner genre expansion, region/date filters, title boundaries, empty results, and honest fixture provenance.",
);

const app = express();
app.use(express.json());
const identity = (uid) => ({
  uid,
  email: "fixture@local.invalid",
  verified: true,
  admin: false,
  token: "fixture",
});
const authenticate = async (req, res) => {
  const uid = req.get("x-fixture-user");
  if (!uid) {
    res.status(401).json({ error: "Sign in" });
    return null;
  }
  return identity(uid);
};
registerTasteRoutes(app, undefined, {
  env,
  provider: fixtureTasteProvider(),
  authenticate,
  listings: () => fixtureListings(today, "SEA"),
});
const listener = app.listen(0, "127.0.0.1");
await once(listener, "listening");
const base = "http://127.0.0.1:" + listener.address().port;
async function post(route, body, uid) {
  return fetch(base + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(uid ? { "x-fixture-user": uid } : {}),
    },
    body: JSON.stringify(body),
  });
}
try {
  assert.equal((await post("/api/taste/tags", { genre: "house" })).status, 401);
  assert.equal(
    (
      await post(
        "/api/taste/tags",
        { genre: "house", email: "private@example.invalid" },
        "alice",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/taste/tags",
        { genre: "private@example.invalid" },
        "alice",
      )
    ).status,
    400,
  );
  const tagResponse = await post(
    "/api/taste/tags",
    { genre: "house" },
    "alice",
  );
  const selected = (await tagResponse.json()).choices[0].token;
  assert.equal(
    (
      await post(
        "/api/taste/plan",
        { choiceToken: selected, goal: "discover_scene", region: "SEA", today },
        "bob",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/taste/plan",
        {
          choiceToken: selected,
          goal: "discover_scene",
          region: "SEA",
          today: "2026-13-01",
        },
        "alice",
      )
    ).status,
    400,
  );
  const planResponse = await post(
    "/api/taste/plan",
    { choiceToken: selected, goal: "discover_scene", region: "SEA", today },
    "alice",
  );
  assert.equal(planResponse.status, 200);
  assert.equal((await planResponse.json()).mode, "offline_fixture");
  const exampleResponse = await post("/api/taste/preview", {
    goal: "smooth_transitions",
    region: "SEA",
    today,
  });
  assert.equal(exampleResponse.status, 200);
  assert.equal((await exampleResponse.json()).mode, "offline_fixture");
  console.log(
    "PASS HTTP authentication, owner-bound tag choices, strict cultural inputs, valid dates, and explicit offline preview.",
  );
} finally {
  await new Promise((resolve) => listener.close(resolve));
}
