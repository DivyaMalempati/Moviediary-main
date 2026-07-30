/**
 * Genre-chip filter tests for getPersonalizedSwipePool.
 *
 * When the user picks Action (etc.) on the swipe screen, the deck must:
 *  - discover only against that genre (not Drama/Crime from taste prefs)
 *  - skip seed-based similar/recs (they ignore the chip)
 *  - prefer films where the chip genre is primary
 *  - drop films where the chip genre is only a late tag
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  moviesTable: {},
  userPreferencesTable: {},
}));

vi.mock("./tmdb.js", () => ({
  discoverMovies: vi.fn(),
  discoverIconicMovies: vi.fn(),
  discoverHiddenGems: vi.fn(),
  discoverStreamingHighlights: vi.fn(),
  discoverByKeyword: vi.fn(),
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
import type { TasteProfile } from "./personalization.js";

function makeFilm(id: number, genres: string[] = []) {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    posterPath: `/p${id}.jpg`,
    releaseYear: 2023,
    originalLanguage: "hi",
    overview: "A film.",
    genres,
    voteAverage: 7.5,
  };
}

const EMPTY_PROFILE: TasteProfile = {
  hasImplicitData: false,
  topGenres: [],
  topLanguages: [],
  genreWeights: {},
  seedMovies: [],
};

describe("getPersonalizedSwipePool – UI genre chip", () => {
  const discoverMoviesMock = tmdb.discoverMovies as Mock;
  const discoverIconicMoviesMock = tmdb.discoverIconicMovies as Mock;
  const discoverHiddenGemsMock = tmdb.discoverHiddenGems as Mock;
  const discoverStreamingHighlightsMock = tmdb.discoverStreamingHighlights as Mock;
  const getGenreNameToIdMapMock = tmdb.getGenreNameToIdMap as Mock;
  const getSimilarMoviesMock = tmdb.getSimilarMovies as Mock;
  const getRecommendationsMock = tmdb.getRecommendations as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    getGenreNameToIdMapMock.mockResolvedValue(
      new Map([
        ["Action", 28],
        ["Drama", 18],
        ["Crime", 80],
        ["Comedy", 35],
      ]),
    );
    discoverHiddenGemsMock.mockResolvedValue([]);
    discoverStreamingHighlightsMock.mockResolvedValue([]);
  });

  it("discovers only the chip genre, not taste Drama/Crime", async () => {
    const actionPrimary = [
      makeFilm(101, ["Action"]),
      makeFilm(102, ["Action", "Thriller"]),
    ];
    const dramaFilms = [makeFilm(201, ["Drama"]), makeFilm(202, ["Drama", "Crime"])];

    discoverMoviesMock.mockImplementation(
      (_langs: string[], _r: unknown, _page: number, genreId?: number) => {
        if (genreId === 28) return Promise.resolve(actionPrimary);
        if (genreId === 18) return Promise.resolve(dramaFilms);
        return Promise.resolve([]);
      },
    );
    discoverIconicMoviesMock.mockResolvedValue([makeFilm(401, ["Action"])]);

    const pool = await getPersonalizedSwipePool({
      profile: {
        ...EMPTY_PROFILE,
        hasImplicitData: true,
        topGenres: ["Drama", "Crime", "Action"],
        topLanguages: ["hi"],
        seedMovies: [{ tmdbId: 10, weight: 5 }],
      },
      explicitPrefs: { languages: ["hi"], genres: ["Drama"] },
      fallbackLanguages: ["hi"],
      page: 1,
      genreIdFilter: 28, // Action chip
      excludeIds: new Set(),
    });

    const genreIdsUsed = discoverMoviesMock.mock.calls.map((c: unknown[]) => c[3]);
    expect(genreIdsUsed.every((id: unknown) => id === 28)).toBe(true);
    expect(genreIdsUsed).not.toContain(18);

    // Seed similar/recs must not run when a chip is selected
    expect(getSimilarMoviesMock).not.toHaveBeenCalled();
    expect(getRecommendationsMock).not.toHaveBeenCalled();

    const poolIds = new Set(pool.map((f) => f.tmdbId));
    expect(poolIds.has(201)).toBe(false);
    expect(poolIds.has(202)).toBe(false);
  });

  it("drops films where Action is only a late tag", async () => {
    const films = [
      makeFilm(101, ["Action"]),
      makeFilm(102, ["Drama", "Crime", "Action"]), // Action 3rd — drop
      makeFilm(103, ["Action", "Crime", "Drama"]), // Action primary — keep
    ];

    discoverMoviesMock.mockResolvedValue(films);
    discoverIconicMoviesMock.mockResolvedValue([]);

    const pool = await getPersonalizedSwipePool({
      profile: EMPTY_PROFILE,
      explicitPrefs: { languages: ["hi"], genres: [] },
      fallbackLanguages: ["hi"],
      page: 1,
      genreIdFilter: 28,
      excludeIds: new Set(),
    });

    const poolIds = pool.map((f) => f.tmdbId);
    expect(poolIds).toContain(101);
    expect(poolIds).toContain(103);
    expect(poolIds).not.toContain(102);
  });

  it("ranks Action-primary films ahead of Drama-primary Action tags", async () => {
    const films = [
      makeFilm(201, ["Drama", "Action"]),
      makeFilm(101, ["Action"]),
      makeFilm(102, ["Action", "Thriller"]),
    ];

    discoverMoviesMock.mockResolvedValue(films);
    discoverIconicMoviesMock.mockResolvedValue([]);

    const pool = await getPersonalizedSwipePool({
      profile: EMPTY_PROFILE,
      explicitPrefs: { languages: ["hi"], genres: [] },
      fallbackLanguages: ["hi"],
      page: 1,
      genreIdFilter: 28,
      excludeIds: new Set(),
    });

    expect(pool.length).toBeGreaterThanOrEqual(2);
    // First card should be an Action-primary film, not Drama/Action
    expect(pool[0].genres?.[0]).toBe("Action");
  });
});
