export const REGION_NAMES: Record<string, string> = {
  ALL: "All regions",
  SEA: "Seattle / PNW",
  LA: "Los Angeles / SoCal",
  SF: "Bay Area",
  TX: "Texas",
  MIA: "Miami / Florida",
  ATL: "Atlanta",
  BOS: "Boston",
  CHI: "Chicago",
  CO: "Colorado",
  DET: "Detroit",
  HI: "Hawaii",
  LV: "Las Vegas",
  NYC: "New York",
  PHX: "Phoenix",
  LDN: "London / UK",
};
const aliases: [string, RegExp][] = [
  ["SEA", /\b(seattle|sea|pnw|pacific northwest|tacoma|portland)\b/i],
  ["SF", /\b(san francisco|sf|bay area|oakland|san jose)\b/i],
  ["LA", /\b(los angeles|la|socal|southern california|san diego)\b/i],
  ["TX", /\b(texas|tx|dfw|dallas|houston|austin)\b/i],
  ["MIA", /\b(miami|mia|florida)\b/i],
  ["ATL", /\b(atlanta|atl|georgia)\b/i],
  ["BOS", /\b(boston|bos|massachusetts)\b/i],
  ["CHI", /\b(chicago|chi|illinois)\b/i],
  ["CO", /\b(colorado|co|denver)\b/i],
  ["DET", /\b(detroit|det|michigan)\b/i],
  ["HI", /\b(hawaii|hi|honolulu)\b/i],
  ["LV", /\b(las vegas|lv|nevada)\b/i],
  ["NYC", /\b(new york|nyc|brooklyn)\b/i],
  ["PHX", /\b(phoenix|phx|arizona)\b/i],
  ["LDN", /\b(london|ldn|uk|britain)\b/i],
];
export function getRegionCode(value?: string | null): string {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || normalized === "ALL") return "ALL";
  if (REGION_NAMES[normalized]) return normalized;
  return (
    aliases.find(([, pattern]) => pattern.test(normalized))?.[0] || normalized
  );
}
export function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export const REGIONS = Object.entries(REGION_NAMES).map(([code, label]) => ({
  code,
  label,
}));
