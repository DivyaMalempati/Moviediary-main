/**
 * Cold-start genre preference tests for getPersonalizedSwipePool.
 *
 * Verifies that when a brand-new user has zero watched films, the swipe pool
 * is filtered toward their saved genre preferences (fallbackGenres) rather
 * than returning a generic pool.
 *
 * Covers:
 *  - preferredGenres populated, topGenres from watch history empty (EMPTY_PROFILE)
 *  - genre-weighted results are present in the returned pool
 *  - no genre preference → only popular + iconic (no genre-weighted bucket)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ── Mock heavy external dependencies before importing the module under test ──

vi.mock("@workspace/db", () => ({
  db: {},
  moviesTable: {},
  userPreferencesTable: {},
}));

vi.mock("./tmdb.js", () => ({
  discoverMovies: vi.fn(),
  discoverIconicMovies: vi.fn(),
  getTrending: vi.fn(),
  getSimilarMovies: vi.fn(),
  getRecommendations: vi.fn(),
  getGenreNameToIdMap: vi.fn(),
}));

vi.mock("./logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getPersonalizedSwipePool } from "./personalization.js";
import * as tmdb from "./tmdb.js";
import type { SwipeCandidate } from "./personalization.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_PROFILE = { hasData: false, topGenres: [], topLanguages: [], seedMovies: [] };

function makeFilm(id: number, genreNames: string[] = [], lang = "hi") {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    posterPath: `/p${id}.jpg`,
    releaseYear: 2023,
    originalLanguage: lang,
    overview: "A film.",
    genres: genreNames,
    voteAverage: 7.5,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getPersonalizedSwipePool – cold-start genre preference", () => {
  const discoverMoviesMock = tmdb.discoverMovies as Mock;
  const discoverIconicMoviesMock = tmdb.discoverIconicMovies as Mock;
  const getGenreNameToIdMapMock = tmdb.getGenreNameToIdMap as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes genre-weighted results when preferredGenres is set and no watch history", async () => {
    // User has "Action" and "Drama" saved as genre preferences but has never
    // watched a film — so topGenres is empty, seedMovies is empty.
    const preferredGenres = ["Action", "Drama"];
    const fallbackLanguages = ["hi", "te"];

    // Name → ID map returned by the genre-map API.
    getGenreNameToIdMapMock.mockResolvedValue(
      new Map([
        ["Action", 28],
        ["Drama", 18],
        ["Comedy", 35],
      ])
    );

    // Genre-specific discover calls return a distinct set of films per genre.
    const actionFilms = [makeFilm(101, ["Action"]), makeFilm(102, ["Action"])];
    const dramaFilms = [makeFilm(201, ["Drama"]), makeFilm(202, ["Drama"])];

    // Popular / iconic discover calls return generic popular films.
    const popularFilms = [makeFilm(301), makeFilm(302), makeFilm(303)];
    const iconicFilms = [makeFilm(401), makeFilm(402)];

    discoverMoviesMock.mockImplementation(
      (_langs: string[], _sort: unknown, _page: number, genreId?: number) => {
        if (genreId === 28) return Promise.resolve(actionFilms);
        if (genreId === 18) return Promise.resolve(dramaFilms);
        return Promise.resolve(popularFilms);
      }
    );
    discoverIconicMoviesMock.mockResolvedValue(iconicFilms);

    const pool = await getPersonalizedSwipePool({
      userId: "user-new",
      profile: EMPTY_PROFILE,
      fallbackLanguages,
      fallbackGenres: preferredGenres,
      page: 1,
      excludeIds: new Set(),
    });

    // The pool must be non-empty.
    expect(pool.length).toBeGreaterThan(0);

    // At least one film from the Action genre-weighted bucket must be present.
    const actionIds = new Set(actionFilms.map((f) => f.tmdbId));
    const dramaIds = new Set(dramaFilms.map((f) => f.tmdbId));
    const poolIds = new Set(pool.map((f) => f.tmdbId));

    const hasActionFilm = [...actionIds].some((id) => poolIds.has(id));
    const hasDramaFilm = [...dramaIds].some((id) => poolIds.has(id));

    expect(hasActionFilm).toBe(true);
    expect(hasDramaFilm).toBe(true);

    // discoverMovies must have been called with the correct genre IDs.
    const genreIdArgs = discoverMoviesMock.mock.calls
      .map((call: unknown[]) => call[3]) // 4th arg is genreId
      .filter((id: unknown) => id !== undefined);

    expect(genreIdArgs).toContain(28); // Action
    expect(genreIdArgs).toContain(18); // Drama
  });

  it("falls back to popular+iconic only when no genre preferences are saved", async () => {
    getGenreNameToIdMapMock.mockResolvedValue(new Map([["Action", 28]]));

    const popularFilms = [makeFilm(301), makeFilm(302), makeFilm(303)];
    const iconicFilms = [makeFilm(401), makeFilm(402)];

    discoverMoviesMock.mockResolvedValue(popularFilms);
    discoverIconicMoviesMock.mockResolvedValue(iconicFilms);

    const pool = await getPersonalizedSwipePool({
      userId: "user-new-no-prefs",
      profile: EMPTY_PROFILE,
      fallbackLanguages: ["hi"],
      fallbackGenres: [], // ← no saved genre preferences
      page: 1,
      excludeIds: new Set(),
    });

    expect(pool.length).toBeGreaterThan(0);

    // When fallbackGenres is empty, discoverMovies should only be called for
    // the popular bucket (no genre ID passed for the cold-start genre-weighted bucket).
    const genreSpecificCalls = discoverMoviesMock.mock.calls.filter(
      (call: unknown[]) => call[3] !== undefined
    );
    expect(genreSpecificCalls.length).toBe(0);
  });

  it("does not include films that are in the user's library (excludeIds)", async () => {
    getGenreNameToIdMapMock.mockResolvedValue(new Map([["Action", 28]]));

    const actionFilms = [makeFilm(101, ["Action"]), makeFilm(102, ["Action"])];
    const popularFilms = [makeFilm(301), makeFilm(302)];
    const iconicFilms = [makeFilm(401)];

    discoverMoviesMock.mockImplementation(
      (_langs: string[], _sort: unknown, _page: number, genreId?: number) => {
        if (genreId === 28) return Promise.resolve(actionFilms);
        return Promise.resolve(popularFilms);
      }
    );
    discoverIconicMoviesMock.mockResolvedValue(iconicFilms);

    // Exclude one of the action films as if it's already in the library.
    const excludeIds = new Set<number>([101]);

    const pool = await getPersonalizedSwipePool({
      userId: "user-new",
      profile: EMPTY_PROFILE,
      fallbackLanguages: ["hi"],
      fallbackGenres: ["Action"],
      page: 1,
      excludeIds,
    });

    const poolIds = pool.map((f) => f.tmdbId);
    expect(poolIds).not.toContain(101);
    expect(poolIds).toContain(102); // the other action film should still be present
  });

  it("topGenres is empty but preferredGenres drives the cold-start genre bucket", async () => {
    // Explicitly documents the case from the task: topGenres=[] but preferredGenres populated.
    getGenreNameToIdMapMock.mockResolvedValue(
      new Map([
        ["Thriller", 53],
        ["Romance", 10749],
      ])
    );

    const thrillerFilms = [makeFilm(501, ["Thriller"]), makeFilm(502, ["Thriller"])];
    const popularFilms = [makeFilm(601)];
    const iconicFilms: never[] = [];

    discoverMoviesMock.mockImplementation(
      (_langs: string[], _sort: unknown, _page: number, genreId?: number) => {
        if (genreId === 53) return Promise.resolve(thrillerFilms);
        return Promise.resolve(popularFilms);
      }
    );
    discoverIconicMoviesMock.mockResolvedValue(iconicFilms);

    // Profile has NO data (brand-new user) — topGenres is empty.
    const profile = { hasData: false, topGenres: [], topLanguages: [], seedMovies: [] };

    const pool = await getPersonalizedSwipePool({
      userId: "user-brand-new",
      profile,
      fallbackLanguages: ["hi"],
      fallbackGenres: ["Thriller"], // saved genre preference only
      page: 1,
      excludeIds: new Set(),
    });

    const poolIds = new Set(pool.map((f) => f.tmdbId));
    // Thriller films (from cold-start genre bucket) must be in the pool.
    expect([...poolIds].some((id) => id === 501 || id === 502)).toBe(true);

    // genre map should have been queried
    expect(getGenreNameToIdMapMock).toHaveBeenCalled();

    // discoverMovies should have been called with genre ID 53 (Thriller)
    const calledWithThriller = discoverMoviesMock.mock.calls.some(
      (call: unknown[]) => call[3] === 53
    );
    expect(calledWithThriller).toBe(true);
  });
});

// ── Sparse-history tests ──────────────────────────────────────────────────────
// These cover the branch at personalization.ts line ~221:
//   const sparseHistory = profile.seedMovies.length < 5;
//   const activeGenres = sparseHistory
//     ? [...new Set([...profile.topGenres, ...fallbackGenres])]
//     : profile.topGenres;

describe("getPersonalizedSwipePool – sparse history (1–4 seed films)", () => {
  const discoverMoviesMock = tmdb.discoverMovies as Mock;
  const discoverIconicMoviesMock = tmdb.discoverIconicMovies as Mock;
  const getGenreNameToIdMapMock = tmdb.getGenreNameToIdMap as Mock;
  const getSimilarMoviesMock = tmdb.getSimilarMovies as Mock;
  const getRecommendationsMock = tmdb.getRecommendations as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("supplements topGenres with fallbackGenres when seedMovies.length < 5", async () => {
    // User has rated 2 films positively → sparse history.
    // topGenres comes from their watch history ("Action").
    // fallbackGenres is their saved preference ("Drama").
    // With sparse history, both should influence the genre-weighted bucket.

    getGenreNameToIdMapMock.mockResolvedValue(
      new Map([
        ["Action", 28],
        ["Drama", 18],
        ["Comedy", 35],
      ])
    );

    const seedFilms: SwipeCandidate[] = [makeFilm(10, ["Action"]), makeFilm(11, ["Action"])];
    const actionFilms: SwipeCandidate[] = [makeFilm(101, ["Action"]), makeFilm(102, ["Action"])];
    const dramaFilms: SwipeCandidate[] = [makeFilm(201, ["Drama"]), makeFilm(202, ["Drama"])];
    const iconicFilms: SwipeCandidate[] = [makeFilm(401), makeFilm(402)];
    const popularFilms: SwipeCandidate[] = [makeFilm(301), makeFilm(302)];

    // Seed-based fetches return films related to the seed movies.
    getSimilarMoviesMock.mockResolvedValue(seedFilms);
    getRecommendationsMock.mockResolvedValue([]);

    discoverMoviesMock.mockImplementation(
      (_langs: string[], _sort: unknown, _page: number, genreId?: number) => {
        if (genreId === 28) return Promise.resolve(actionFilms); // Action
        if (genreId === 18) return Promise.resolve(dramaFilms);  // Drama (from fallbackGenres)
        return Promise.resolve(popularFilms);
      }
    );
    discoverIconicMoviesMock.mockResolvedValue(iconicFilms);

    const profile = {
      hasData: true,
      topGenres: ["Action"],        // from watch history
      topLanguages: ["hi"],
      seedMovies: [
        { tmdbId: 10, weight: 5 },  // 2 seed films → sparse
        { tmdbId: 11, weight: 4 },
      ],
    };

    const pool = await getPersonalizedSwipePool({
      userId: "user-sparse",
      profile,
      fallbackLanguages: ["hi"],
      fallbackGenres: ["Drama"],    // saved preference not yet in watch history
      page: 1,
      excludeIds: new Set(),
    });

    expect(pool.length).toBeGreaterThan(0);

    // Drama films (from fallbackGenres supplement) must appear in the pool.
    const poolIds = new Set(pool.map((f) => f.tmdbId));
    const hasDramaFilm = [201, 202].some((id) => poolIds.has(id));
    expect(hasDramaFilm).toBe(true);

    // discoverMovies must have been called with both genre IDs.
    const genreIdArgs = discoverMoviesMock.mock.calls.map((call: unknown[]) => call[3]);
    expect(genreIdArgs).toContain(28); // Action  (topGenres)
    expect(genreIdArgs).toContain(18); // Drama   (fallbackGenres supplement)
  });

  it("does not use fallbackGenres once seedMovies.length reaches 5", async () => {
    // User has 5 positively-rated films → full history.
    // topGenres: ["Action"]. fallbackGenres: ["Drama"].
    // Drama must NOT influence the genre-weighted bucket.

    getGenreNameToIdMapMock.mockResolvedValue(
      new Map([
        ["Action", 28],
        ["Drama", 18],
      ])
    );

    const seedFilms: SwipeCandidate[] = [makeFilm(10, ["Action"])];
    const actionFilms: SwipeCandidate[] = [makeFilm(101, ["Action"]), makeFilm(102, ["Action"])];
    const dramaFilms: SwipeCandidate[] = [makeFilm(201, ["Drama"]), makeFilm(202, ["Drama"])];
    const iconicFilms: SwipeCandidate[] = [makeFilm(401)];
    const popularFilms: SwipeCandidate[] = [makeFilm(301)];

    getSimilarMoviesMock.mockResolvedValue(seedFilms);
    getRecommendationsMock.mockResolvedValue([]);

    discoverMoviesMock.mockImplementation(
      (_langs: string[], _sort: unknown, _page: number, genreId?: number) => {
        if (genreId === 28) return Promise.resolve(actionFilms);
        if (genreId === 18) return Promise.resolve(dramaFilms);
        return Promise.resolve(popularFilms);
      }
    );
    discoverIconicMoviesMock.mockResolvedValue(iconicFilms);

    const profile = {
      hasData: true,
      topGenres: ["Action"],
      topLanguages: ["hi"],
      // Exactly 5 seed films → NOT sparse; fallbackGenres must be ignored.
      seedMovies: [
        { tmdbId: 10, weight: 5 },
        { tmdbId: 11, weight: 5 },
        { tmdbId: 12, weight: 4 },
        { tmdbId: 13, weight: 3 },
        { tmdbId: 14, weight: 2 },
      ],
    };

    const pool = await getPersonalizedSwipePool({
      userId: "user-full-history",
      profile,
      fallbackLanguages: ["hi"],
      fallbackGenres: ["Drama"],   // should be ignored once we have 5 seeds
      page: 1,
      excludeIds: new Set(),
    });

    expect(pool.length).toBeGreaterThan(0);

    // discoverMovies must NOT have been called with Drama's genre ID.
    const genreIdArgs = discoverMoviesMock.mock.calls.map((call: unknown[]) => call[3]);
    expect(genreIdArgs).not.toContain(18); // Drama must be absent

    // Action genre should still drive the genre-weighted bucket.
    expect(genreIdArgs).toContain(28);

    // Drama films must not appear in the pool.
    const poolIds = new Set(pool.map((f) => f.tmdbId));
    const hasDramaFilm = [201, 202].some((id) => poolIds.has(id));
    expect(hasDramaFilm).toBe(false);
  });
});
