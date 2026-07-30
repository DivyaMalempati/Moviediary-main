/**
 * Curated TMDB Keyword IDs for niche trope / vibe searching.
 * @see https://www.themoviedb.org/keyword
 */
export const TROPE_KEYWORDS = [
  {
    slug: "treasure-hunt",
    name: "Treasure Hunt",
    keywordId: 10292,
    description: "Quests for lost treasure, maps, and adventure finds.",
  },
  {
    slug: "serial-killer",
    name: "Serial Killer",
    keywordId: 10291,
    description: "Thrillers centered on serial killers and pursuits.",
  },
  {
    slug: "heist",
    name: "Heist",
    keywordId: 10051,
    description: "Crews, vaults, and the perfect score.",
  },
  {
    slug: "twist-ending",
    name: "Twist Ending",
    keywordId: 10595,
    description: "Films known for a sharp final turn.",
  },
] as const;

export type TropeSlug = (typeof TROPE_KEYWORDS)[number]["slug"];

export function tropeBySlug(slug: string) {
  return TROPE_KEYWORDS.find((t) => t.slug === slug) ?? null;
}

export function tropeByKeywordId(keywordId: number) {
  return TROPE_KEYWORDS.find((t) => t.keywordId === keywordId) ?? null;
}
