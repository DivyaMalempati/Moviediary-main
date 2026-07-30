import { db, moviesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  discoverMovies,
  discoverIconicMovies,
  getSimilarMovies,
  getRecommendations,
  getGenreNameToIdMap,
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
}

export interface TasteProfile {
  hasImplicitData: boolean; // has at least one rated watched film
  topGenres: string[]; // implicit, from ratings — ranked highest-weight first
  topLanguages: string[]; // implicit, from ratings — ranked highest-weight first
  seedMovies: { tmdbId: number; weight: number }[]; // top-rated films to seed similar/recommendations
}

const EMPTY_PROFILE: TasteProfile = { hasImplicitData: false, topGenres: [], topLanguages: [], seedMovies: [] };

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

  const hasRatedFilm = seedCandidates.length > 0 || topGenres.length > 0;
  return { hasImplicitData: hasRatedFilm, topGenres, topLanguages, seedMovies };
}

/** Implicit signal (learned from ratings) always ranks ahead of explicit
 *  (stated at onboarding) — behavior should adapt as taste data accumulates,
 *  with the stated preference as a steady baseline rather than the ceiling. */
function mergeRanked(implicit: string[], explicit: string[], cap: number): string[] {
  const merged = [...implicit];
  for (const item of explicit) {
    if (!merged.includes(item)) merged.push(item);
  }
  return merged.slice(0, cap);
}

/**
 * Resolve discover languages.
 *
 * Explicit onboarding/settings languages are a hard allowlist — selecting
 * only Hindi/Telugu/Tamil must not pull in Korean/French via watch history
 * or the world-cinema fallback. Implicit taste only reorders within that set.
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

// ── Pool assembly ────────────────────────────────────────────────────────────

export interface SwipeCandidate {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  originalLanguage: string | null;
  overview: string | null;
  genres: string[] | null;
  voteAverage?: number | null;
}

const TARGET_BATCH = 20;

const MIX_WARM = { seedBased: 0.45, genreWeighted: 0.3, iconic: 0.15, latest: 0.1 };
// Cold start (no ratings yet) has no seeds to draw "similar to" from — lean
// on the explicit onboarding genres/languages instead of generic popular.
const MIX_COLD_WITH_PREFS = { genreWeighted: 0.55, iconic: 0.25, latest: 0.2 };
const MIX_COLD_NO_PREFS = { iconic: 0.5, latest: 0.5 };
// UI genre chip selected — skip seed "similar" (it ignores the chip and floods
// Action with Action/Crime/Drama hybrids). Discover only against the chip genre.
const MIX_GENRE_FILTER = { genreWeighted: 0.6, iconic: 0.25, latest: 0.15 };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * How strongly a film belongs to the selected genre.
 * TMDB lists genres in relevance order — primary Action should beat
 * Drama/Crime films that merely tag Action as a tertiary genre.
 */
function genreFitScore(film: SwipeCandidate, genreName: string): number {
  const genres = film.genres ?? [];
  const idx = genres.indexOf(genreName);
  if (idx < 0) return -1;

  // Position: primary >> secondary >> later tags
  const positionScore = idx === 0 ? 100 : idx === 1 ? 55 : idx === 2 ? 25 : 10;
  // Fewer tags = more focused (Action-only > Action/Crime/Drama)
  const focusBonus = Math.max(0, 24 - Math.max(0, genres.length - 1) * 8);

  // Soft-penalize when the chip genre is secondary to a broad primary
  // (Drama/Crime often pull Action decks toward crime-dramas).
  let companionPenalty = 0;
  if (idx >= 1) {
    const primary = genres[0];
    if (primary === "Drama" || primary === "Crime") companionPenalty = 35;
  }

  return positionScore + focusBonus - companionPenalty;
}

/** Prefer primary-genre matches; light jitter so decks don't feel deterministic. */
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
    // When a chip is selected, drop films where the genre is only a late tag
    // (e.g. Drama/Crime/Action with Action in 3rd+ slot) — those feel off-genre.
    if (genreName) {
      const idx = (m.genres ?? []).indexOf(genreName);
      if (idx > 1) return false;
    }
    seen.add(m.tmdbId);
    return true;
  });

  return genreName ? rankByGenreFit(filtered, genreName) : filtered;
}

/**
 * Builds a personalized swipe batch, blending:
 *  - implicit taste learned from rated watch history (strongest, once it exists)
 *  - explicit preferences stated at onboarding / in settings (baseline, always available)
 *
 * A brand-new user who just finished onboarding gets a genre/language-weighted
 * deck immediately — not a generic popular/iconic fallback — even with zero
 * watch history yet.
 */
export async function getPersonalizedSwipePool(opts: {
  profile: TasteProfile;
  explicitPrefs: ExplicitPreferences;
  fallbackLanguages: string[];
  page: number;
  genreIdFilter?: number;
  excludeIds: Set<number>;
}): Promise<SwipeCandidate[]> {
  const { profile, explicitPrefs, fallbackLanguages, page, genreIdFilter, excludeIds } = opts;

  const languageAllowlist =
    explicitPrefs.languages.length > 0 ? explicitPrefs.languages : null;
  const effectiveLanguages = resolveLanguages(
    profile.topLanguages,
    explicitPrefs.languages,
    fallbackLanguages,
  );

  const watch =
    explicitPrefs.providerIds && explicitPrefs.providerIds.length > 0
      ? {
          providerIds: explicitPrefs.providerIds,
          watchRegion: explicitPrefs.watchRegion || "IN",
        }
      : undefined;

  const nameToId = await getGenreNameToIdMap().catch(() => new Map<string, number>());
  const idToName = new Map([...nameToId.entries()].map(([name, id]) => [id, name]));
  const genreNames = mergeRanked(profile.topGenres, explicitPrefs.genres, 4);
  const genreIds = genreNames.map((g) => nameToId.get(g)).filter((id): id is number => !!id);

  const clean = (list: SwipeCandidate[]) =>
    filterByLanguages(dedupeAndFilter(list, excludeIds, genreIdFilter, idToName), languageAllowlist);
  // When a UI chip is active, keep rank order from clean(); otherwise shuffle for variety.
  const prep = (list: SwipeCandidate[]) => (genreIdFilter ? clean(list) : shuffle(clean(list)));

  // When there's no explicit UI genre filter, pick from the user's preferred
  // genre IDs so that ALL pool buckets (not just genreWeighted) respect taste.
  // page-based rotation gives variety across pages while staying within prefs.
  const iconicGenreId  = genreIdFilter ?? genreIds[page % Math.max(genreIds.length, 1)];
  const latestGenreId  = genreIdFilter ?? genreIds[(page + 1) % Math.max(genreIds.length, 1)];

  // ── Genre chip selected: fetch ONLY that genre (ignore taste Drama/Crime mix
  //    and seed-similar, which is what was flooding Action decks with hybrids) ──
  if (genreIdFilter) {
    const [primaryPage, nextPage, iconic, latest] = await Promise.all([
      discoverMovies(effectiveLanguages, undefined, page, genreIdFilter, watch).catch(() => []),
      discoverMovies(effectiveLanguages, undefined, page + 1, genreIdFilter, watch).catch(() => []),
      discoverIconicMovies(effectiveLanguages, page, genreIdFilter, watch).catch(() => []),
      // Offset latest page so it doesn't duplicate the primary discover page
      discoverMovies(effectiveLanguages, undefined, page + 2, genreIdFilter, watch).catch(() => []),
    ]);
    const pools = {
      genreWeighted: prep([...primaryPage, ...nextPage]),
      iconic: prep(iconic),
      latest: prep(latest),
    };
    // Assemble by mix ratios, then re-rank so primary-genre films lead the deck.
    const batch = assemble(pools, MIX_GENRE_FILTER, TARGET_BATCH, { shuffleResult: false });
    const genreName = idToName.get(genreIdFilter);
    return genreName ? rankByGenreFit(batch, genreName) : batch;
  }

  // ── Cold start: no rated watch history yet ──────────────────────────────
  if (!profile.hasImplicitData || profile.seedMovies.length === 0) {
    if (genreIds.length > 0 || explicitPrefs.languages.length > 0 || watch) {
      // They told us what they like at onboarding — use it immediately.
      // Use up to 3 genre IDs so more of the stated taste is covered.
      const genreCalls = genreIds
        .slice(0, 3)
        .map((gid) => discoverMovies(effectiveLanguages, undefined, page, gid, watch).catch(() => []));
      const [genreResults, iconic, latest] = await Promise.all([
        Promise.all(genreCalls.length ? genreCalls : [discoverMovies(effectiveLanguages, undefined, page, iconicGenreId, watch).catch(() => [])]),
        discoverIconicMovies(effectiveLanguages, page, iconicGenreId, watch).catch(() => []),
        discoverMovies(effectiveLanguages, undefined, page, latestGenreId, watch).catch(() => []),
      ]);
      const pools = {
        genreWeighted: prep(genreResults.flat()),
        iconic: prep(iconic),
        latest: prep(latest),
      };
      return assemble(pools, MIX_COLD_WITH_PREFS, TARGET_BATCH);
    }

    // No signal at all (shouldn't normally happen once onboarding is in
    // place, but covers users who skip it) — old generic behavior.
    const [iconic, latest] = await Promise.all([
      discoverIconicMovies(effectiveLanguages, page, genreIdFilter, watch).catch(() => []),
      discoverMovies(effectiveLanguages, undefined, page, genreIdFilter, watch).catch(() => []),
    ]);
    const pools = { iconic: prep(iconic), latest: prep(latest) };
    return assemble(pools, MIX_COLD_NO_PREFS, TARGET_BATCH);
  }

  // ── Warm: has rated watch history — implicit taste leads, explicit prefs
  //    still fill in the genre/language pool (resolveLanguages already constrained) ──
  const seedResults = await Promise.allSettled(
    profile.seedMovies.map((s) => Promise.all([getSimilarMovies(s.tmdbId), getRecommendations(s.tmdbId)])),
  );
  let seedBased: SwipeCandidate[] = [];
  for (const r of seedResults) {
    if (r.status === "fulfilled") {
      const [similar, recs] = r.value;
      seedBased.push(...similar, ...recs);
    } else {
      logger.warn({ err: r.reason }, "Seed-based swipe fetch failed for one seed movie");
    }
  }

  // When filtering to "on my services", seed-similar/recs ignore providers —
  // lean on discover buckets instead so the deck stays streamable tonight.
  if (watch) seedBased = [];

  let genreWeighted: SwipeCandidate[] = [];
  if (genreIds.length > 0) {
    // Use up to 3 genre IDs — more coverage of stated/learned taste.
    const genreCalls = genreIds.slice(0, 3).map((gid) => discoverMovies(effectiveLanguages, undefined, page, gid, watch).catch(() => []));
    genreWeighted = (await Promise.all(genreCalls)).flat();
  } else if (watch) {
    genreWeighted = await discoverMovies(effectiveLanguages, undefined, page, undefined, watch).catch(() => []);
  }

  // Iconic and latest also respect the user's genre preferences (not just the
  // optional UI filter), so Drama/Romance don't flood the non-genre-weighted slots.
  const iconic = await discoverIconicMovies(effectiveLanguages, page, iconicGenreId, watch).catch(() => []);
  const latest = await discoverMovies(effectiveLanguages, undefined, page, latestGenreId, watch).catch(() => []);

  const pools = {
    seedBased: prep(seedBased),
    genreWeighted: prep(genreWeighted),
    iconic: prep(iconic),
    latest: prep(latest),
  };

  return assemble(pools, watch ? MIX_COLD_WITH_PREFS : MIX_WARM, TARGET_BATCH);
}

function assemble<K extends string>(
  pools: Record<K, SwipeCandidate[]>,
  mix: Record<K, number>,
  target: number,
  opts: { shuffleResult?: boolean } = {},
): SwipeCandidate[] {
  const wanted = Object.fromEntries(
    (Object.keys(mix) as K[]).map((k) => [k, Math.round(target * mix[k])]),
  ) as Record<K, number>;

  const takenIds = new Set<number>();
  const result: SwipeCandidate[] = [];
  const take = (pool: SwipeCandidate[], n: number) => {
    let taken = 0;
    for (const m of pool) {
      if (taken >= n) break;
      if (takenIds.has(m.tmdbId)) continue;
      takenIds.add(m.tmdbId);
      result.push(m);
      taken++;
    }
  };

  (Object.keys(wanted) as K[]).forEach((key) => take(pools[key], wanted[key]));

  if (result.length < target) {
    // Prefer already-ranked leftovers when genre-filtered; shuffle otherwise.
    const leftovers = opts.shuffleResult === false
      ? (Object.keys(pools) as K[]).flatMap((k) => pools[k])
      : shuffle((Object.keys(pools) as K[]).flatMap((k) => pools[k]));
    take(leftovers, target - result.length);
  }

  return opts.shuffleResult === false ? result : shuffle(result);
}
