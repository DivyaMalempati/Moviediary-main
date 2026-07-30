/**
 * Explicit language preferences must hard-filter the swipe deck.
 * Selecting only Indian languages must not surface Korean/French/etc.
 * via watch-history merge or seed-based similar/recs.
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
  getTrending: vi.fn(),
  getSimilarMovies: vi.fn(),
  getRecommendations: vi.fn(),
  getGenreNameToIdMap: vi.fn(),
}));

vi.mock("./logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getPersonalizedSwipePool,
  resolveLanguages,
  type TasteProfile,
} from "./personalization.js";
import * as tmdb from "./tmdb.js";

function makeFilm(id: number, lang: string, genres: string[] = ["Drama"]) {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    posterPath: `/p${id}.jpg`,
    releaseYear: 2023,
    originalLanguage: lang,
    overview: "A film.",
    genres,
    voteAverage: 7.5,
  };
}

describe("resolveLanguages", () => {
  it("uses explicit prefs as a hard allowlist even when implicit has world langs", () => {
    expect(
      resolveLanguages(
        ["ja", "ko", "fr", "de", "it", "es"],
        ["hi", "te", "ta"],
        ["ml", "ko", "ja"],
      ),
    ).toEqual(["hi", "te", "ta"]);
  });

  it("ranks overlapping implicit langs first within the explicit set", () => {
    expect(resolveLanguages(["te", "ja"], ["hi", "te", "ta"], ["ko"])).toEqual([
      "te",
      "hi",
      "ta",
    ]);
  });

  it("falls back when neither implicit nor explicit is set", () => {
    expect(resolveLanguages([], [], ["hi", "ko"])).toEqual(["hi", "ko"]);
  });
});

describe("getPersonalizedSwipePool – explicit language allowlist", () => {
  const discoverMoviesMock = tmdb.discoverMovies as Mock;
  const discoverIconicMoviesMock = tmdb.discoverIconicMovies as Mock;
  const getGenreNameToIdMapMock = tmdb.getGenreNameToIdMap as Mock;
  const getSimilarMoviesMock = tmdb.getSimilarMovies as Mock;
  const getRecommendationsMock = tmdb.getRecommendations as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    getGenreNameToIdMapMock.mockResolvedValue(new Map([["Drama", 18]]));
  });

  it("discovers only with the user's selected languages, not world-cinema merge", async () => {
    discoverMoviesMock.mockResolvedValue([makeFilm(1, "hi"), makeFilm(2, "te")]);
    discoverIconicMoviesMock.mockResolvedValue([makeFilm(3, "hi")]);

    const profile: TasteProfile = {
      hasImplicitData: false,
      topGenres: [],
      // Watch history includes Japanese — must NOT expand discover langs.
      topLanguages: ["ja", "ko"],
      seedMovies: [],
    };

    await getPersonalizedSwipePool({
      profile,
      explicitPrefs: { languages: ["hi", "te", "ta"], genres: ["Drama"] },
      fallbackLanguages: ["hi", "te", "ko", "ja", "fr"],
      page: 1,
      excludeIds: new Set(),
    });

    for (const call of discoverMoviesMock.mock.calls) {
      expect(call[0]).toEqual(["hi", "te", "ta"]);
    }
    for (const call of discoverIconicMoviesMock.mock.calls) {
      expect(call[0]).toEqual(["hi", "te", "ta"]);
    }
  });

  it("drops seed-based similar/recs outside the preferred languages", async () => {
    getSimilarMoviesMock.mockResolvedValue([
      makeFilm(10, "ja"),
      makeFilm(11, "hi"),
      makeFilm(12, "ko"),
    ]);
    getRecommendationsMock.mockResolvedValue([makeFilm(13, "fr"), makeFilm(14, "te")]);
    discoverMoviesMock.mockResolvedValue([makeFilm(20, "hi"), makeFilm(21, "ta")]);
    discoverIconicMoviesMock.mockResolvedValue([makeFilm(30, "ml")]);

    const profile: TasteProfile = {
      hasImplicitData: true,
      topGenres: ["Drama"],
      topLanguages: ["ja"],
      seedMovies: [{ tmdbId: 99, weight: 5 }],
    };

    const pool = await getPersonalizedSwipePool({
      profile,
      explicitPrefs: { languages: ["hi", "te", "ta", "ml"], genres: ["Drama"] },
      fallbackLanguages: ["ko", "ja", "fr"],
      page: 1,
      excludeIds: new Set(),
    });

    expect(pool.length).toBeGreaterThan(0);
    for (const film of pool) {
      expect(["hi", "te", "ta", "ml"]).toContain(film.originalLanguage);
    }
    expect(pool.map((f) => f.tmdbId)).not.toContain(10);
    expect(pool.map((f) => f.tmdbId)).not.toContain(12);
    expect(pool.map((f) => f.tmdbId)).not.toContain(13);
  });
});
