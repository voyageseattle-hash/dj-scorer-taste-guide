import {
  classifyMusicGenre,
  genreLabel,
  type MusicGenre,
  type TasteGoal,
  type TastePlan,
  type TasteEvent,
} from "../src/lib/tasteTypes";
import { getRegionCode } from "../src/lib/regions";
import type { CulturalTag, TasteProvider } from "./tasteProvider";

export interface ListingInput {
  eventId?: string;
  id?: string;
  title: string;
  location: string;
  date: string;
  region: string;
  tags?: string[];
  source?: string;
  ticketUrl?: string;
  sourceUrl?: string;
}
export const mentionsArtistName = (title: string, artist: string) => {
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const name = normalized(artist);
  return (
    name.length >= 4 &&
    (" " + normalized(title) + " ").includes(" " + name + " ")
  );
};
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
export async function createTastePlan(
  provider: TasteProvider,
  selected: CulturalTag,
  goal: TasteGoal,
  region: string,
  today: string,
  events: ListingInput[],
): Promise<TastePlan> {
  const source = provider.mode === "qloo" ? "Qloo" : "Offline fixture";
  const artists = await provider.recommend(selected);
  const broaden = goal !== "smooth_transitions";
  const related =
    broaden && artists.length ? await provider.artistTags(artists) : [];
  const weights = new Map<MusicGenre, number>([[selected.genre, 3]]);
  for (const tag of related)
    weights.set(
      tag.genre,
      Math.max(
        weights.get(tag.genre) || 0,
        1 + Math.max(0, Math.min(1, tag.affinity || 0)),
      ),
    );
  const ranked = events
    .filter(
      (event) =>
        event.date >= today &&
        (region === "ALL" || getRegionCode(event.region) === region),
    )
    .map((event) => {
      const matched = [
        ...new Set(
          (event.tags || [])
            .map(classifyMusicGenre)
            .filter(
              (genre): genre is MusicGenre =>
                genre !== null && weights.has(genre),
            ),
        ),
      ];
      const names = artists.filter((artist) =>
        mentionsArtistName(event.title, artist.name),
      );
      const weight =
        matched.reduce((sum, genre) => sum + (weights.get(genre) || 0), 0) +
        names.length * 3;
      const item: TasteEvent = {
        id: event.eventId || event.id || event.title + event.date,
        title: event.title,
        location: event.location,
        date: event.date,
        region: getRegionCode(event.region),
        matchedGenres: matched.map(genreLabel),
        reasons: [
          ...matched.map((genre) => `Listing is tagged ${genreLabel(genre)}.`),
          ...names.map((artist) => `Listing mentions ${artist.name}.`),
        ],
        source: event.source || "Listing source",
        url: safeUrl(event.ticketUrl || event.sourceUrl || ""),
      };
      return { item, weight };
    })
    .filter((item) => item.weight > 0)
    .sort(
      (a, b) => b.weight - a.weight || a.item.date.localeCompare(b.item.date),
    )
    .slice(0, 6)
    .map(({ item }) => item);
  const labels = [...weights.keys()].map(genreLabel);
  const practice =
    goal === "smooth_transitions"
      ? {
          title: "Give the handover room to breathe",
          minutes: 20,
          steps: [
            `Choose two ${genreLabel(selected.genre)} tracks from your library with compatible rhythms.`,
            "Mark a 16- or 32-bar handover; compare a decisive cut with a longer EQ blend.",
            "Record both versions and listen for the bass swap, vocal space, and level changes.",
          ],
          check:
            "You can describe which handover fits the phrase and why. Use a technique audit to review the recording.",
        }
      : goal === "build_energy"
        ? {
            title: "Build a three-track energy arc",
            minutes: 25,
            steps: [
              `Pick a foundation track, a contrast, and a peak across ${labels.slice(0, 3).join(" / ")}.`,
              "Plan the transition point before each drop. Use a deliberate breakdown or cut when rhythms differ.",
              "Record the sequence, level-match the tracks, and compare the build with your planned peak.",
            ],
            check:
              "The strongest moment arrives where you planned, with no accidental level jump.",
          }
        : {
            title: "Bring one new sound into your set",
            minutes: 15,
            steps: [
              artists.length
                ? "Listen to one suggested artist and choose a track you have permission to use."
                : `Choose an unfamiliar ${genreLabel(selected.genre)} track from your own authorized library.`,
              `Compare its phrasing and rhythm with another ${genreLabel(selected.genre)} track from your own library.`,
              "Try a short bridge between them, then check a matching scene listing for a night to explore.",
            ],
            check:
              "You can explain the musical link and name one transition you want to practice.",
          };
  return {
    mode: provider.mode,
    createdAt: new Date().toISOString(),
    goal,
    selectedGenre: genreLabel(selected.genre),
    artists,
    relatedGenres: labels,
    events: ranked,
    calendarStatus: ranked.length
      ? "matched"
      : events.length
        ? "no_matches"
        : "empty",
    practice,
    trace: [
      { label: "Confirmed the sound", source, detail: selected.name },
      {
        label: "Explored related artists",
        source,
        detail: `${artists.length} artist results.`,
      },
      ...(broaden && artists.length
        ? [
            {
              label: "Expanded the music tags",
              source,
              detail: `${related.length} compatible music tags.`,
            },
          ]
        : []),
      {
        label: "Matched the scene",
        source: "DJ Scorer",
        detail: `${ranked.length} listings matched their published tags or artist names.`,
      },
      {
        label: "Built your practice plan",
        source: "DJ Scorer",
        detail:
          "Exercises reflect your chosen goal, not an assessment of your ability.",
      },
    ],
    limitations: [
      provider.mode === "offline_fixture"
        ? "This example uses invented Qloo responses and fictional listings. No Qloo request was made."
        : "Qloo describes aggregate cultural affinities, not the probability of your preferences or attendance.",
      ...(!artists.length
        ? [
            "No artist suggestions were returned. This plan uses the confirmed music tag.",
          ]
        : []),
      "Event matching and practice exercises are DJ Scorer interpretations. Check the listing source and choose tracks from your own authorized library.",
    ],
  };
}
