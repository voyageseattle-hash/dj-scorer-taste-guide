import type { TasteProvider, CulturalTag } from "./tasteProvider";
import type { ListingInput } from "./tastePlanner";
export const exampleTag: CulturalTag = {
  id: "fixture:tag:house",
  name: "House — example tag",
  genre: "house",
  affinity: null,
};
export function fixtureTasteProvider(): TasteProvider {
  return {
    mode: "offline_fixture",
    findTags: async () => [exampleTag],
    recommend: async () => [
      { id: "fixture:artist:one", name: "Example House Artist", affinity: 0.8 },
      {
        id: "fixture:artist:two",
        name: "Example Garage Artist",
        affinity: 0.7,
      },
    ],
    artistTags: async () => [
      exampleTag,
      {
        id: "fixture:tag:garage",
        name: "UK garage — example tag",
        genre: "garage",
        affinity: 0.6,
      },
    ],
  };
}
export function fixtureListings(today: string, region: string): ListingInput[] {
  const second = new Date(today + "T12:00:00Z");
  second.setUTCDate(second.getUTCDate() + 2);
  return [
    {
      eventId: "fixture:event:one",
      title: "Example House Session",
      location: "Fictional studio venue",
      date: today,
      region: region === "ALL" ? "SEA" : region,
      tags: ["house"],
      source: "Fictional example",
    },
    {
      eventId: "fixture:event:two",
      title: "Example Garage Night",
      location: "Fictional listening room",
      date: second.toISOString().slice(0, 10),
      region: region === "ALL" ? "SEA" : region,
      tags: ["uk garage"],
      source: "Fictional example",
    },
  ];
}
