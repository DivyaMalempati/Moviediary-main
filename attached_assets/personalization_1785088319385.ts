import { db, moviesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  discoverMovies,
  discoverIconicMovies,
  getTrending,
  getSimilarMovies,
  getRecommendations,
  getGenreNameToIdMap,
} from "./tmdb.js";
import { logger } from "./logger.js";

// ── Rating → weight ──────────────────────────────────────────────────────────
// "meh" gets a small negative weight so genres/languages the user consistently
// dislikes don't keep getting reinforced — everything else scales with how
// much they loved it. Unrated watched films still count a little (watching
// something at all is a weak positive signal even before it's rated).
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

export interface TasteProfile {
  hasData: boolean;
  topGenres: string[]; // genre names, ranked highest-weight first
  topLanguages: string[]; // ISO 639-1 codes, ranked highest-weight first
  seedMovies: { tmdbId: number; weight: number }[]; // top-rated films to seed similar/recommendations
}

const EMPTY_PROFILE: TasteProfile = { hasData: false, topGenres: [], topLanguages: [], seedMovies: [] };

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

  // Cap at 5 seeds — enough signal without hammering TMDB on every batch fetch.
  const seedMovies = seedCandidates
    .sort((a, b) => b.weight - a.weight || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map(({ tmdbId, weight }) => ({ tmdbId, weight }));

  return { hasData: true, topGenres, topLanguages, seedMovies };
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

// Target mix when we have a real taste profile. "Latest" stays in the mix
// deliberately — new releases are still worth surfacing, just not the majority.
const MIX = { seedBased: 0.45, genreWeighted: 0.3, iconic: 0.15, latest: 0.1 };

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
 * Builds a personalized swipe batch. Falls back to the old popular+iconic
 * behavior when the user has no rated watch history yet (cold start).
 */
export async function getPersonalizedSwipePool(opts: {
  userId: string;
  profile: TasteProfile;
  fallbackLanguages: string[];
  page: number;
  genreIdFilter?: number;
  excludeIds: Set<number>;
}): Promise<SwipeCandidate[]> {
  const { profile, fallbackLanguages, page, genreIdFilter, excludeIds } = opts;
  const languages = profile.topLanguages.length > 0 ? profile.topLanguages : fallbackLanguages;

  // Cold start / no ratings yet: same behavior as before (popular + iconic).
  if (!profile.hasData || profile.seedMovies.length === 0) {
    const [popular, iconic] = await Promise.all([
      discoverMovies(languages, undefined, page, genreIdFilter).catch(() => []),
      discoverIconicMovies(languages, page, genreIdFilter).catch(() => []),
    ]);
    const merged = dedupeAndFilter(shuffle([...popular, ...iconic]), excludeIds, undefined, null);
    return merged.slice(0, TARGET_BATCH);
  }

  const nameToId = await getGenreNameToIdMap().catch(() => new Map<string, number>());
  const idToName = new Map([...nameToId.entries()].map(([name, id]) => [id, name]));
  const topGenreIds = profile.topGenres.map((g) => nameToId.get(g)).filter((id): id is number => !!id);

  // 1. Seed-based: similar + recommendations from the user's top-rated films.
  //    This is the strongest personalization signal — it's TMDB's own
  //    "people who liked this also liked" graph, seeded by what THIS user loved.
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

  // 2. Genre-weighted discover: broadens beyond the exact seed films to the
  //    user's top 1-2 genres (by rating-weighted score), in their top languages.
  let genreWeighted: SwipeCandidate[] = [];
  if (topGenreIds.length > 0) {
    const genreCalls = topGenreIds
      .slice(0, 2)
      .map((gid) => discoverMovies(languages, undefined, page, gid).catch(() => []));
    const results = await Promise.all(genreCalls);
    genreWeighted = results.flat();
  }

  // 3. Iconic — small trusted-classics slice, still in the user's languages.
  const iconic = await discoverIconicMovies(languages, page, genreIdFilter).catch(() => []);

  // 4. Latest/trending — small slice so new releases keep surfacing too.
  const latest = await discoverMovies(languages, undefined, page, genreIdFilter).catch(() => []);

  // Clean each pool (posters required, dedupe, exclude library/seen, apply
  // the user's genre chip filter if one is active).
  const clean = (list: SwipeCandidate[]) => dedupeAndFilter(list, excludeIds, genreIdFilter, idToName);
  const pools = {
    seedBased: shuffle(clean(seedBased)),
    genreWeighted: shuffle(clean(genreWeighted)),
    iconic: shuffle(clean(iconic)),
    latest: shuffle(clean(latest)),
  };

  // Weighted draw with backfill: if a pool runs short, pull extra from
  // whichever pool has the most left, so we still return a full batch.
  const wanted = {
    seedBased: Math.round(TARGET_BATCH * MIX.seedBased),
    genreWeighted: Math.round(TARGET_BATCH * MIX.genreWeighted),
    iconic: Math.round(TARGET_BATCH * MIX.iconic),
    latest: Math.round(TARGET_BATCH * MIX.latest),
  };

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

  (Object.keys(wanted) as (keyof typeof wanted)[]).forEach((key) => take(pools[key], wanted[key]));

  // Backfill from the combined leftovers of all pools if still short.
  if (result.length < TARGET_BATCH) {
    const leftovers = shuffle([...pools.seedBased, ...pools.genreWeighted, ...pools.iconic, ...pools.latest]);
    take(leftovers, TARGET_BATCH - result.length);
  }

  return shuffle(result);
}
