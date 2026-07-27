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

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dedupeAndFilter(
  candidates: SwipeCandidate[],
  excludeIds: Set<number>,
  genreIdFilter: number | undefined,
  genreIdToName: Map<number, string> | null,
): SwipeCandidate[] {
  const seen = new Set<number>();
  return candidates.filter((m) => {
    if (!m.tmdbId || !m.posterPath || excludeIds.has(m.tmdbId) || seen.has(m.tmdbId)) return false;
    if (genreIdFilter && genreIdToName) {
      const genreName = genreIdToName.get(genreIdFilter);
      if (genreName && !(m.genres ?? []).includes(genreName)) return false;
    }
    seen.add(m.tmdbId);
    return true;
  });
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

  const languages = mergeRanked(profile.topLanguages, explicitPrefs.languages, 6);
  const effectiveLanguages = languages.length > 0 ? languages : fallbackLanguages;

  const nameToId = await getGenreNameToIdMap().catch(() => new Map<string, number>());
  const idToName = new Map([...nameToId.entries()].map(([name, id]) => [id, name]));
  const genreNames = mergeRanked(profile.topGenres, explicitPrefs.genres, 4);
  const genreIds = genreNames.map((g) => nameToId.get(g)).filter((id): id is number => !!id);

  const clean = (list: SwipeCandidate[]) => dedupeAndFilter(list, excludeIds, genreIdFilter, idToName);

  // ── Cold start: no rated watch history yet ──────────────────────────────
  if (!profile.hasImplicitData || profile.seedMovies.length === 0) {
    if (genreIds.length > 0 || explicitPrefs.languages.length > 0) {
      // They told us what they like at onboarding — use it immediately.
      const genreCalls = genreIds
        .slice(0, 2)
        .map((gid) => discoverMovies(effectiveLanguages, undefined, page, gid).catch(() => []));
      const [genreResults, iconic, latest] = await Promise.all([
        Promise.all(genreCalls.length ? genreCalls : [discoverMovies(effectiveLanguages, undefined, page, genreIdFilter).catch(() => [])]),
        discoverIconicMovies(effectiveLanguages, page, genreIdFilter).catch(() => []),
        discoverMovies(effectiveLanguages, undefined, page, genreIdFilter).catch(() => []),
      ]);
      const pools = {
        genreWeighted: shuffle(clean(genreResults.flat())),
        iconic: shuffle(clean(iconic)),
        latest: shuffle(clean(latest)),
      };
      return assemble(pools, MIX_COLD_WITH_PREFS, TARGET_BATCH);
    }

    // No signal at all (shouldn't normally happen once onboarding is in
    // place, but covers users who skip it) — old generic behavior.
    const [iconic, latest] = await Promise.all([
      discoverIconicMovies(effectiveLanguages, page, genreIdFilter).catch(() => []),
      discoverMovies(effectiveLanguages, undefined, page, genreIdFilter).catch(() => []),
    ]);
    const pools = { iconic: shuffle(clean(iconic)), latest: shuffle(clean(latest)) };
    return assemble(pools, MIX_COLD_NO_PREFS, TARGET_BATCH);
  }

  // ── Warm: has rated watch history — implicit taste leads, explicit prefs
  //    still fill in the genre/language pool (mergeRanked already blended them) ──
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

  let genreWeighted: SwipeCandidate[] = [];
  if (genreIds.length > 0) {
    const genreCalls = genreIds.slice(0, 2).map((gid) => discoverMovies(effectiveLanguages, undefined, page, gid).catch(() => []));
    genreWeighted = (await Promise.all(genreCalls)).flat();
  }

  const iconic = await discoverIconicMovies(effectiveLanguages, page, genreIdFilter).catch(() => []);
  const latest = await discoverMovies(effectiveLanguages, undefined, page, genreIdFilter).catch(() => []);

  const pools = {
    seedBased: shuffle(clean(seedBased)),
    genreWeighted: shuffle(clean(genreWeighted)),
    iconic: shuffle(clean(iconic)),
    latest: shuffle(clean(latest)),
  };

  return assemble(pools, MIX_WARM, TARGET_BATCH);
}

function assemble<K extends string>(
  pools: Record<K, SwipeCandidate[]>,
  mix: Record<K, number>,
  target: number,
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
    const leftovers = shuffle((Object.keys(pools) as K[]).flatMap((k) => pools[k]));
    take(leftovers, target - result.length);
  }

  return shuffle(result);
}
