/**
 * Curated TMDB Keyword IDs for niche trope / vibe searching.
 * IDs verified against https://www.themoviedb.org/keyword/{id}
 *
 * Indian films are often under-tagged for English trope keywords, so each
 * entry can list relatedKeywordIds (OR query) and indiaSeedTmdbIds (manual
 * boost for well-known Indian titles missing the tag).
 *
 * @see https://www.themoviedb.org/keyword
 */
export const TROPE_KEYWORDS = [
  {
    slug: "treasure-hunt",
    name: "Treasure Hunt",
    keywordId: 6956,
    /** treasure | lost treasure | quest — OR'd to catch under-tagged India titles */
    relatedKeywordIds: [1454, 169953, 207372],
    indiaSeedTmdbIds: [
      401285, // Jagga Jasoos (hi)
      412197, // Maragadha Naanayam (ta)
      891445, // Bimbisara (te)
      80944, // Bhairava Dweepam (te)
      496968, // Carbon (ml)
    ],
    description: "Quests for lost treasure, maps, and adventure finds.",
  },
  {
    slug: "serial-killer",
    name: "Serial Killer",
    keywordId: 10714,
    relatedKeywordIds: [227428], // female serial killer
    indiaSeedTmdbIds: [] as number[],
    description: "Thrillers centered on serial killers and pursuits.",
  },
  {
    slug: "heist",
    name: "Heist",
    keywordId: 10051,
    relatedKeywordIds: [239663], // treasure heist
    indiaSeedTmdbIds: [] as number[],
    description: "Crews, vaults, and the perfect score.",
  },
  {
    slug: "twist-ending",
    name: "Twist Ending",
    keywordId: 326438,
    relatedKeywordIds: [275311, 335567], // plot twist, surprise ending
    indiaSeedTmdbIds: [] as number[],
    description: "Films known for a sharp final turn.",
  },
] as const;

export type TropeSlug = (typeof TROPE_KEYWORDS)[number]["slug"];

export type TropeDefinition = (typeof TROPE_KEYWORDS)[number];

export function tropeBySlug(slug: string): TropeDefinition | null {
  return TROPE_KEYWORDS.find((t) => t.slug === slug) ?? null;
}

export function tropeByKeywordId(keywordId: number): TropeDefinition | null {
  return (
    TROPE_KEYWORDS.find(
      (t) =>
        t.keywordId === keywordId ||
        (t.relatedKeywordIds as readonly number[]).includes(keywordId),
    ) ?? null
  );
}

/** Primary + related keyword ids for a TMDB OR query. */
export function tropeKeywordIdsOr(trope: TropeDefinition): number[] {
  return [trope.keywordId, ...trope.relatedKeywordIds];
}
