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
    /** TMDB genre IDs ANDed for India discover when keywords under-tag regional films. */
    genreIdsAnd: [] as number[],
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
    genreIdsAnd: [] as number[],
    indiaSeedTmdbIds: [] as number[],
    description: "Thrillers centered on serial killers and pursuits.",
  },
  {
    slug: "heist",
    name: "Heist",
    keywordId: 10051,
    relatedKeywordIds: [239663], // treasure heist
    genreIdsAnd: [] as number[],
    indiaSeedTmdbIds: [] as number[],
    description: "Crews, vaults, and the perfect score.",
  },
  {
    slug: "twist-ending",
    name: "Twist Ending",
    keywordId: 326438,
    relatedKeywordIds: [275311, 335567], // plot twist, surprise ending
    genreIdsAnd: [] as number[],
    indiaSeedTmdbIds: [] as number[],
    description: "Films known for a sharp final turn.",
  },
  {
    slug: "forensic-investigation",
    name: "Forensic Investigation",
    keywordId: 160313, // forensic
    relatedKeywordIds: [
      157256, // forensic science
      212512, // forensic psychology
      308457, // forensic medicine
      161982, // murder investigation
    ],
    /** Mystery — Indian forensic films rarely carry English forensic keywords. */
    genreIdsAnd: [9648] as number[],
    indiaSeedTmdbIds: [
      1309121, // Anomie (ml)
    ],
    description: "Labs, evidence, and science-driven casework.",
  },
  {
    slug: "investigative-thriller",
    name: "Investigative Thriller",
    keywordId: 158927, // police investigation
    relatedKeywordIds: [
      157241, // criminal investigation
      268067, // police procedural
      161982, // murder investigation
      15167, // police detective
    ],
    /** Crime ∧ Mystery — keyword tags alone miss most Indian procedurals. */
    genreIdsAnd: [80, 9648] as number[],
    indiaSeedTmdbIds: [
      1309121, // Anomie (ml)
      247652, // Drishyam (ml)
      505954, // Ratsasan (ta)
    ],
    description: "Detectives, procedurals, and case rabbit holes.",
  },
  {
    slug: "crime-thriller",
    name: "Crime Thriller",
    keywordId: 355372, // crime thriller
    relatedKeywordIds: [
      378968, // crime detective thriller
      226769, // paranoid thriller
    ],
    /**
     * Crime ∧ Thriller genres. Niche keyword 355372 barely tags Indian cinema,
     * so keyword-only discover was empty / useless — never fall back to popular.
     */
    genreIdsAnd: [80, 53] as number[],
    indiaSeedTmdbIds: [
      247652, // Drishyam (ml)
      534780, // Andhadhun (hi)
      84332, // Kahaani (hi)
      505954, // Ratsasan (ta)
      192140, // Memories (ml)
    ],
    description: "Crime stories with tension, pursuit, and stakes.",
  },
  {
    slug: "suspense",
    name: "Suspense",
    keywordId: 288394, // suspense
    relatedKeywordIds: [
      319190, // suspense thriller
      316362, // thriller (keyword tag)
    ],
    /** Thriller ∧ Mystery — tighter than Thriller alone for India. */
    genreIdsAnd: [53, 9648] as number[],
    indiaSeedTmdbIds: [] as number[],
    description: "Edge-of-seat tension and slow-burn dread.",
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

/** Genre IDs ANDed for India-first discover (empty = keywords/seeds only). */
export function tropeGenreIdsAnd(trope: TropeDefinition): number[] {
  return [...(trope.genreIdsAnd ?? [])];
}
