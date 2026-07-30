import { db, moviesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  discoverMovies,
  discoverIconicMovies,
  discoverHiddenGems,
  discoverStreamingHighlights,
  discoverByKeyword,
  getSimilarMovies,
  getRecommendations,
  getGenreNameToIdMap,
  type WatchFilter,
} from "./tmdb.js";
import { logger } from "./logger.js";

// ── Rating → weight ──────────────────────────────────────────────────────────
const RATING_WEIGHT: Record<string, number> = {
  loved: 5,
  great: 4,
  very_good: 3,
  good: 2,
  ok: 1,
  avg: 0.5,
  meh: -1,
};
const UNRATED_WEIGHT = 0.25;

export interface ExplicitPreferences {
  languages: string[]; // ISO 639-1 codes, from onboarding/settings
  genres: string[]; // genre names, from onboarding/settings
  providerIds?: number[]; // TMDB watch provider IDs
  watchRegion?: string; // ISO country for watch availability
  /** India CBFC max certification (U | UA | A). */
  maxCertification?: string | null;
  /** Genres to never recommend. */
  mutedGenres?: string[];
}

export interface TasteProfile {
  hasImplicitData: boolean; // has at least one rated watched film
  topGenres: string[]; // implicit, from ratings — ranked highest-weight first
  topLanguages: string[]; // implicit, from ratings — ranked highest-weight first
  /** Genre name → accumulated rating weight (for partner intersection). */
  genreWeights: Record<string, number>;
  seedMovies: { tmdbId: number; weight: number }[]; // top-rated films to seed similar/recommendations
}

const EMPTY_PROFILE: TasteProfile = {
  hasImplicitData: false,
  topGenres: [],
  topLanguages: [],
  genreWeights: {},
  seedMovies: [],
};

export async function buildTasteProfile(userId: string): Promise<TasteProfile> {
  const watched = await db
    .select()
    .from(moviesTable)
    .where(and(eq(moviesTable.userId, userId), eq(moviesTable.status, "watched")));

  if (watched.length === 0) return EMPTY_PROFILE;

  const genreScores = new Map<string, number>();
  const langScores = new Map<string, number>();
  const seedCandidates: { tmdbId: number; weight: number; createdAt: Date }[] = [];

  for (const m of watched) {
    const weight = m.rating ? (RATING_WEIGHT[m.rating] ?? 0) : UNRATED_WEIGHT;
    (m.genres ?? []).forEach((g) => genreScores.set(g, (genreScores.get(g) ?? 0) + weight));
    if (m.originalLanguage) {
      langScores.set(m.originalLanguage, (langScores.get(m.originalLanguage) ?? 0) + weight);
    }
    if (m.tmdbId && weight > 0) {
      seedCandidates.push({ tmdbId: m.tmdbId, weight, createdAt: m.createdAt });
    }
  }

  const topGenres = [...genreScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);

  const topLanguages = [...langScores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => code);

  const seedMovies = seedCandidates
    .sort((a, b) => b.weight - a.weight || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map(({ tmdbId, weight }) => ({ tmdbId, weight }));

  const genreWeights = Object.fromEntries(
    [...genreScores.entries()].filter(([, score]) => score > 0),
  );

  const hasRatedFilm = seedCandidates.length > 0 || topGenres.length > 0;
  return {
    hasImplicitData: hasRatedFilm,
    topGenres,
    topLanguages,
    genreWeights,
    seedMovies,
  };
}

/** Implicit signal ranks ahead of explicit stated prefs. */
function mergeRanked(implicit: string[], explicit: string[], cap: number): string[] {
  const merged = [...implicit];
  for (const item of explicit) {
    if (!merged.includes(item)) merged.push(item);
  }
  return merged.slice(0, cap);
}

/**
 * Resolve discover languages.
 * Explicit onboarding/settings languages are a hard allowlist.
 */
export function resolveLanguages(
  implicit: string[],
  explicit: string[],
  fallback: string[],
  cap = 8,
): string[] {
  if (explicit.length > 0) {
    const ranked = [
      ...implicit.filter((l) => explicit.includes(l)),
      ...explicit.filter((l) => !implicit.includes(l)),
    ];
    return ranked.slice(0, cap);
  }
  if (implicit.length > 0) return implicit.slice(0, cap);
  return fallback.slice(0, cap);
}

function filterByLanguages(
  films: SwipeCandidate[],
  allowed: string[] | null,
): SwipeCandidate[] {
  if (!allowed || allowed.length === 0) return films;
  const set = new Set(allowed);
  return films.filter((f) => !f.originalLanguage || set.has(f.originalLanguage));
}

function filterMutedGenres(
  films: SwipeCandidate[],
  muted: string[] | undefined,
): SwipeCandidate[] {
  if (!muted?.length) return films;
  const set = new Set(muted.map((g) => g.toLowerCase()));
  return films.filter((f) => {
    const genres = f.genres ?? [];
    if (genres.length === 0) return true;
    return !genres.some((g) => set.has(g.toLowerCase()));
  });
}

// ── Pool assembly ────────────────────────────────────────────────────────────

export type DeckSource = "safe" | "streaming" | "wildcard" | "trope";

export interface SwipeCandidate {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  overview: string | null;
  genres: string[] | null;
  voteAverage?: number | null;
  /** Which 80/20 deck bucket produced this card. */
  source?: DeckSource;
}

/** Final visible deck size (matches frontend DECK_SIZE). */
export const TARGET_DECK = 12;

/**
 * 80/20 familiarity mix:
 *  - 60% Safe Matches — top genre/keyword (seed + genre-weighted) taste
 *  - 20% Contextual/Streaming — high-rated on the user's OTT apps
 *  - 20% Wildcard/Hidden Gems — vote_average >= 7.2, vote_count <= 3000
 */
export const MIX_DECK = { safe: 0.6, streaming: 0.2, wildcard: 0.2 };

const MIX_GENRE_FILTER = { safe: 0.7, streaming: 0.15, wildcard: 0.15 };
const MIX_TROPE = { safe: 0.5, streaming: 0.2, wildcard: 0.3 };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tagSource(films: SwipeCandidate[], source: DeckSource): SwipeCandidate[] {
  return films.map((f) => ({ ...f, source: f.source ?? source }));
}

function genreFitScore(film: SwipeCandidate, genreName: string): number {
  const genres = film.genres ?? [];
  const idx = genres.indexOf(genreName);
  if (idx < 0) return -1;

  const positionScore = idx === 0 ? 100 : idx === 1 ? 55 : idx === 2 ? 25 : 10;
  const focusBonus = Math.max(0, 24 - Math.max(0, genres.length - 1) * 8);

  let companionPenalty = 0;
  if (idx >= 1) {
    const primary = genres[0];
    if (primary === "Drama" || primary === "Crime") companionPenalty = 35;
  }

  return positionScore + focusBonus - companionPenalty;
}

function rankByGenreFit(films: SwipeCandidate[], genreName: string | undefined): SwipeCandidate[] {
  if (!genreName) return films;
  return films
    .map((f) => ({ f, score: genreFitScore(f, genreName) + Math.random() * 12 }))
    .sort((a, b) => b.score - a.score)
    .map(({ f }) => f);
}

function dedupeAndFilter(
  candidates: SwipeCandidate[],
  excludeIds: Set<number>,
  genreIdFilter: number | undefined,
  genreIdToName: Map<number, string> | null,
): SwipeCandidate[] {
  const seen = new Set<number>();
  const genreName = genreIdFilter && genreIdToName ? genreIdToName.get(genreIdFilter) : undefined;

  const filtered = candidates.filter((m) => {
    if (!m.tmdbId || !m.posterPath || excludeIds.has(m.tmdbId) || seen.has(m.tmdbId)) return false;
    if (genreName && !(m.genres ?? []).includes(genreName)) return false;
    if (genreName) {
      const idx = (m.genres ?? []).indexOf(genreName);
      if (idx > 1) return false;
    }
    seen.add(m.tmdbId);
    return true;
  });

  return genreName ? rankByGenreFit(filtered, genreName) : filtered;
}

export function assembleDeckMix(
  pools: Partial<Record<DeckSource, SwipeCandidate[]>>,
  mix: Partial<Record<DeckSource, number>>,
  target: number,
  opts: { shuffleResult?: boolean } = {},
): SwipeCandidate[] {
  const keys = Object.keys(mix) as DeckSource[];
  const wanted = Object.fromEntries(
    keys.map((k) => [k, Math.round(target * (mix[k] ?? 0))]),
  ) as Record<DeckSource, number>;

  // Ensure quotas sum to target when rounding drifts.
  const quotaSum = keys.reduce((s, k) => s + wanted[k], 0);
  if (quotaSum !== target && keys.length > 0) {
    const primary = keys[0];
    wanted[primary] = Math.max(0, wanted[primary] + (target - quotaSum));
  }

  const takenIds = new Set<number>();
  const result: SwipeCandidate[] = [];
  const take = (pool: SwipeCandidate[] | undefined, n: number, source: DeckSource) => {
    if (!pool || n <= 0) return;
    let taken = 0;
    for (const m of pool) {
      if (taken >= n) break;
      if (takenIds.has(m.tmdbId)) continue;
      takenIds.add(m.tmdbId);
      result.push({ ...m, source: m.source ?? source });
      taken++;
    }
  };

  for (const key of keys) take(pools[key], wanted[key], key);

  if (result.length < target) {
    const leftovers = opts.shuffleResult === false
      ? keys.flatMap((k) => pools[k] ?? [])
      : shuffle(keys.flatMap((k) => pools[k] ?? []));
    take(leftovers, target - result.length, keys[0] ?? "safe");
  }

  return opts.shuffleResult === false ? result : shuffle(result);
}

async function fetchSafeMatches(opts: {
  profile: TasteProfile;
  effectiveLanguages: string[];
  page: number;
  genreIds: number[];
  genreIdFilter?: number;
  watch?: WatchFilter;
  certification?: { country?: string; max?: string | null };
}): Promise<SwipeCandidate[]> {
  const { profile, effectiveLanguages, page, genreIds, genreIdFilter, watch, certification } = opts;
  const safe: SwipeCandidate[] = [];

  if (!watch && profile.seedMovies.length > 0 && !genreIdFilter) {
    const seedResults = await Promise.allSettled(
      profile.seedMovies.map((s) =>
        Promise.all([getSimilarMovies(s.tmdbId), getRecommendations(s.tmdbId)]),
      ),
    );
    for (const r of seedResults) {
      if (r.status === "fulfilled") {
        const [similar, recs] = r.value;
        safe.push(...similar, ...recs);
      } else {
        logger.warn({ err: r.reason }, "Seed-based swipe fetch failed for one seed movie");
      }
    }
  }

  const gids = genreIdFilter
    ? [genreIdFilter]
    : genreIds.slice(0, 3);
  if (gids.length > 0) {
    const genreCalls = gids.map((gid) =>
      discoverMovies(effectiveLanguages, undefined, page, gid, watch, { certification }).catch(() => []),
    );
    safe.push(...(await Promise.all(genreCalls)).flat());
  } else {
    safe.push(
      ...(await discoverMovies(effectiveLanguages, undefined, page, undefined, watch, { certification }).catch(() => [])),
    );
    safe.push(
      ...(await discoverIconicMovies(effectiveLanguages, page, undefined, watch, certification).catch(() => [])),
    );
  }

  return tagSource(safe, "safe");
}

/**
 * Builds a personalized 10–12 card swipe deck with the 60/20/20 mix.
 */
export async function getPersonalizedSwipePool(opts: {
  profile: TasteProfile;
  explicitPrefs: ExplicitPreferences;
  fallbackLanguages: string[];
  page: number;
  genreIdFilter?: number;
  keywordId?: number;
  excludeIds: Set<number>;
  /** Override deck size (default 12). */
  target?: number;
}): Promise<SwipeCandidate[]> {
  const {
    profile,
    explicitPrefs,
    fallbackLanguages,
    page,
    genreIdFilter,
    keywordId,
    excludeIds,
    target = TARGET_DECK,
  } = opts;

  const languageAllowlist =
    explicitPrefs.languages.length > 0 ? explicitPrefs.languages : null;
  const effectiveLanguages = resolveLanguages(
    profile.topLanguages,
    explicitPrefs.languages,
    fallbackLanguages,
  );

  const providers = explicitPrefs.providerIds ?? [];
  const watchRegion = explicitPrefs.watchRegion || "IN";
  const watch: WatchFilter | undefined =
    providers.length > 0 ? { providerIds: providers, watchRegion } : undefined;

  // Streaming bucket always uses OTT filter when available.
  const streamingWatch = watch;
  const certification =
    explicitPrefs.maxCertification && explicitPrefs.maxCertification !== "A"
      ? { country: watchRegion || "IN", max: explicitPrefs.maxCertification }
      : undefined;
  const mutedGenres = explicitPrefs.mutedGenres ?? [];

  const nameToId = await getGenreNameToIdMap().catch(() => new Map<string, number>());
  const idToName = new Map([...nameToId.entries()].map(([name, id]) => [id, name]));
  const mutedSet = new Set(mutedGenres.map((g) => g.toLowerCase()));
  const genreNames = mergeRanked(profile.topGenres, explicitPrefs.genres, 4)
    .filter((g) => !mutedSet.has(g.toLowerCase()));
  const genreIds = genreNames.map((g) => nameToId.get(g)).filter((id): id is number => !!id);

  const clean = (list: SwipeCandidate[]) =>
    filterMutedGenres(
      filterByLanguages(dedupeAndFilter(list, excludeIds, genreIdFilter, idToName), languageAllowlist),
      mutedGenres,
    );
  const prep = (list: SwipeCandidate[], source: DeckSource) =>
    tagSource(genreIdFilter ? clean(list) : shuffle(clean(list)), source);

  const mixGenreId =
    genreIdFilter ?? genreIds[page % Math.max(genreIds.length, 1)];

  // Trope / keyword override — still apply 80/20 familiarity around the trope.
  if (keywordId != null) {
    const [tropePage, streaming, gems] = await Promise.all([
      discoverByKeyword(keywordId, effectiveLanguages, page, genreIdFilter, undefined, certification).catch(() => []),
      streamingWatch
        ? discoverByKeyword(keywordId, effectiveLanguages, page, genreIdFilter, streamingWatch, certification).catch(() => [])
        : Promise.resolve([]),
      discoverByKeyword(keywordId, effectiveLanguages, page + 1, genreIdFilter, undefined, certification)
        .then(async (base) => {
          const gems = await discoverHiddenGems(effectiveLanguages, page, genreIdFilter, undefined, certification).catch(() => []);
          return [...base, ...gems];
        })
        .catch(() => []),
    ]);
    const pools = {
      safe: prep(tropePage, "trope"),
      streaming: prep(streaming.length ? streaming : tropePage, "streaming"),
      wildcard: prep(gems, "wildcard"),
    };
    return assembleDeckMix(pools, MIX_TROPE, target);
  }

  const [safeRaw, streamingRaw, wildcardRaw] = await Promise.all([
    fetchSafeMatches({
      profile,
      effectiveLanguages,
      page,
      genreIds,
      genreIdFilter,
      // Safe matches are NOT locked to OTT — familiarity from taste.
      watch: undefined,
      certification,
    }),
    streamingWatch
      ? discoverStreamingHighlights(
          effectiveLanguages,
          page,
          mixGenreId,
          streamingWatch,
          certification,
        ).catch(() => [])
      : Promise.resolve([] as SwipeCandidate[]),
    discoverHiddenGems(effectiveLanguages, page, mixGenreId, undefined, certification).catch(() => []),
  ]);

  // If user has no OTT prefs, fold streaming quota into safe (still 80% familiarity).
  const hasStreaming = streamingRaw.length > 0 && !!streamingWatch;
  const pools = {
    safe: prep(safeRaw, "safe"),
    streaming: hasStreaming ? prep(streamingRaw, "streaming") : [],
    wildcard: prep(wildcardRaw, "wildcard"),
  };

  const mix = genreIdFilter
    ? MIX_GENRE_FILTER
    : hasStreaming
      ? MIX_DECK
      : { safe: 0.8, streaming: 0, wildcard: 0.2 };

  const batch = assembleDeckMix(pools, mix, target, {
    shuffleResult: !genreIdFilter,
  });

  if (genreIdFilter) {
    const genreName = idToName.get(genreIdFilter);
    return genreName ? rankByGenreFit(batch, genreName) : batch;
  }
  return batch;
}

/**
 * Intersect two taste profiles for partner match decks:
 * multiply shared genre weights, prefer shared languages & OTT platforms.
 */
export function intersectTasteProfiles(
  a: TasteProfile,
  b: TasteProfile,
  prefsA: ExplicitPreferences,
  prefsB: ExplicitPreferences,
): {
  profile: TasteProfile;
  explicitPrefs: ExplicitPreferences;
} {
  const sharedGenreWeights: Record<string, number> = {};
  for (const [genre, wA] of Object.entries(a.genreWeights)) {
    const wB = b.genreWeights[genre];
    if (wB != null && wA > 0 && wB > 0) {
      sharedGenreWeights[genre] = wA * wB;
    }
  }
  // Fall back to union of top genres when intersection is empty.
  let topGenres = Object.entries(sharedGenreWeights)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([name]) => name);
  if (topGenres.length === 0) {
    topGenres = mergeRanked(a.topGenres, b.topGenres, 4);
  }

  const langIntersect = a.topLanguages.filter((l) => b.topLanguages.includes(l));
  const explicitLangIntersect = prefsA.languages.filter((l) => prefsB.languages.includes(l));
  const languages =
    explicitLangIntersect.length > 0
      ? explicitLangIntersect
      : langIntersect.length > 0
        ? langIntersect
        : mergeRanked(prefsA.languages, prefsB.languages, 6);

  const providerIntersect = (prefsA.providerIds ?? []).filter((id) =>
    (prefsB.providerIds ?? []).includes(id),
  );
  const providerUnion = [
    ...new Set([...(prefsA.providerIds ?? []), ...(prefsB.providerIds ?? [])]),
  ];

  const seedMovies = [...a.seedMovies, ...b.seedMovies]
    .sort((x, y) => y.weight - x.weight)
    .filter((s, i, arr) => arr.findIndex((t) => t.tmdbId === s.tmdbId) === i)
    .slice(0, 5);

  const mutedGenres = [
    ...new Set([...(prefsA.mutedGenres ?? []), ...(prefsB.mutedGenres ?? [])]),
  ];
  const certRank = (c: string | null | undefined) =>
    c === "U" ? 0 : c === "UA" ? 1 : c === "A" ? 2 : 3;
  const maxCertification =
    certRank(prefsA.maxCertification) <= certRank(prefsB.maxCertification)
      ? prefsA.maxCertification ?? prefsB.maxCertification ?? null
      : prefsB.maxCertification ?? prefsA.maxCertification ?? null;

  return {
    profile: {
      hasImplicitData: a.hasImplicitData || b.hasImplicitData,
      topGenres,
      topLanguages: langIntersect.length > 0 ? langIntersect : mergeRanked(a.topLanguages, b.topLanguages, 5),
      genreWeights: sharedGenreWeights,
      seedMovies,
    },
    explicitPrefs: {
      languages,
      genres: mergeRanked(
        prefsA.genres,
        prefsB.genres,
        4,
      ),
      // Prefer shared OTT; fall back to union so the couple has something to watch.
      providerIds: providerIntersect.length > 0 ? providerIntersect : providerUnion,
      watchRegion: prefsA.watchRegion || prefsB.watchRegion || "IN",
      mutedGenres,
      maxCertification,
    },
  };
}
