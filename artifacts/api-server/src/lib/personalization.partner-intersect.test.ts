import { describe, expect, it } from "vitest";
import {
  intersectTasteProfiles,
  type ExplicitPreferences,
  type TasteProfile,
} from "./personalization.js";

const emptyProfile = (partial?: Partial<TasteProfile>): TasteProfile => ({
  hasImplicitData: false,
  topGenres: [],
  topLanguages: [],
  genreWeights: {},
  seedMovies: [],
  ...partial,
});

const prefs = (partial?: Partial<ExplicitPreferences>): ExplicitPreferences => ({
  languages: [],
  genres: [],
  providerIds: [],
  watchRegion: "IN",
  maxCertification: null,
  mutedGenres: [],
  ...partial,
});

describe("intersectTasteProfiles for movie-night ritual", () => {
  it("prefers genres both people already chose in Preferences", () => {
    const { explicitPrefs } = intersectTasteProfiles(
      emptyProfile(),
      emptyProfile(),
      prefs({ genres: ["Action", "Comedy", "Drama"], languages: ["hi", "en"] }),
      prefs({ genres: ["Comedy", "Romance", "Action"], languages: ["hi", "te"] }),
    );
    expect(explicitPrefs.genres).toEqual(["Action", "Comedy"]);
    expect(explicitPrefs.languages).toEqual(["hi"]);
  });

  it("falls back to a blended genre list when there is no shared preference", () => {
    const { explicitPrefs } = intersectTasteProfiles(
      emptyProfile(),
      emptyProfile(),
      prefs({ genres: ["Horror"] }),
      prefs({ genres: ["Documentary"] }),
    );
    expect(explicitPrefs.genres).toEqual(expect.arrayContaining(["Horror", "Documentary"]));
    expect(explicitPrefs.genres).toHaveLength(2);
  });
});
