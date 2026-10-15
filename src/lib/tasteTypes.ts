export const MUSIC_GENRES = [
  {
    id: "house",
    label: "House",
    aliases: [
      "house",
      "deep house",
      "tech house",
      "progressive house",
      "electro house",
    ],
  },
  {
    id: "techno",
    label: "Techno",
    aliases: ["techno", "hard techno", "melodic techno", "minimal techno"],
  },
  {
    id: "dnb",
    label: "Drum & bass",
    aliases: [
      "drum bass",
      "drum and bass",
      "drum n bass",
      "dnb",
      "jungle",
      "liquid drum bass",
    ],
  },
  {
    id: "garage",
    label: "UK garage",
    aliases: [
      "garage",
      "uk garage",
      "2 step",
      "2step",
      "speed garage",
      "bassline",
    ],
  },
  {
    id: "hiphop",
    label: "Hip-hop",
    aliases: ["hip hop", "hiphop", "rap", "trap", "drill"],
  },
  { id: "grime", label: "Grime", aliases: ["grime"] },
  { id: "dubstep", label: "Dubstep", aliases: ["dubstep", "riddim"] },
  {
    id: "trance",
    label: "Trance",
    aliases: ["trance", "psytrance", "progressive trance"],
  },
  {
    id: "disco",
    label: "Disco",
    aliases: ["disco", "nu disco", "funk", "funky house"],
  },
  {
    id: "breaks",
    label: "Breaks",
    aliases: ["breaks", "breakbeat", "breakbeats"],
  },
  {
    id: "ambient",
    label: "Ambient & downtempo",
    aliases: ["ambient", "downtempo", "chillout", "trip hop"],
  },
  {
    id: "bass",
    label: "Bass music",
    aliases: ["bass", "bass music", "future bass"],
  },
  { id: "pop", label: "Pop", aliases: ["pop", "dance pop", "electropop"] },
] as const;
export type MusicGenre = (typeof MUSIC_GENRES)[number]["id"];
export const TASTE_GOALS = [
  { id: "smooth_transitions", label: "Smooth my transitions" },
  { id: "build_energy", label: "Build an energy arc" },
  { id: "discover_scene", label: "Discover a new sound" },
] as const;
export type TasteGoal = (typeof TASTE_GOALS)[number]["id"];
export const normalizeMusicName = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\bmusic\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function classifyMusicGenre(value: string): MusicGenre | null {
  const normalized = normalizeMusicName(value);
  return (
    MUSIC_GENRES.find((genre) =>
      genre.aliases.some((alias) => normalizeMusicName(alias) === normalized),
    )?.id || null
  );
}
export const genreLabel = (id: MusicGenre) =>
  MUSIC_GENRES.find((genre) => genre.id === id)!.label;
export interface TasteStatus {
  state: "ready" | "disconnected";
  credentialConfigured: boolean;
  missing: string[];
  message: string;
  offlineExampleAvailable: boolean;
}
export interface TasteChoice {
  token: string;
  label: string;
  genre: MusicGenre;
}
export interface TasteArtist {
  id: string;
  name: string;
  affinity: number | null;
}
export interface TasteEvent {
  id: string;
  title: string;
  location: string;
  date: string;
  region: string;
  matchedGenres: string[];
  reasons: string[];
  source: string;
  url: string;
}
export interface TastePlan {
  mode: "qloo" | "offline_fixture";
  createdAt: string;
  goal: TasteGoal;
  selectedGenre: string;
  artists: TasteArtist[];
  relatedGenres: string[];
  events: TasteEvent[];
  calendarStatus: "matched" | "no_matches" | "empty";
  practice: { title: string; minutes: number; steps: string[]; check: string };
  trace: { label: string; source: string; detail: string }[];
  limitations: string[];
}
