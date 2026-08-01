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
    const { explicitPrefs, overlap } = intersectTasteProfiles(
      emptyProfile(),
      emptyProfile(),
      prefs({ genres: ["Action", "Comedy", "Drama"], languages: ["hi", "en"] }),
      prefs({ genres: ["Comedy", "Romance", "Action"], languages: ["hi", "te"] }),
    );
    expect(explicitPrefs.genres).toEqual(["Action", "Comedy"]);
    expect(explicitPrefs.languages).toEqual(["hi"]);
    expect(overlap.genres).toBe(true);
    expect(overlap.languages).toBe(true);
  });

  it("does not silently union genres when there is no shared preference", () => {
    const { explicitPrefs, overlap } = intersectTasteProfiles(
      emptyProfile(),
      emptyProfile(),
      prefs({ genres: ["Horror"] }),
      prefs({ genres: ["Documentary"] }),
    );
    expect(explicitPrefs.genres).toEqual([]);
    expect(overlap.genres).toBe(false);
  });

  it("keeps streaming providers as intersection only", () => {
    const { explicitPrefs, overlap } = intersectTasteProfiles(
      emptyProfile(),
      emptyProfile(),
      prefs({ providerIds: [8, 119], genres: ["Drama"] }),
      prefs({ providerIds: [232, 8], genres: ["Drama"] }),
    );
    expect(explicitPrefs.providerIds).toEqual([8]);
    expect(overlap.providers).toBe(true);
  });

  it("reports no provider overlap when both chose OTTs with no shared app", () => {
    const { explicitPrefs, overlap } = intersectTasteProfiles(
      emptyProfile(),
      emptyProfile(),
      prefs({ providerIds: [8], genres: ["Drama"] }),
      prefs({ providerIds: [232], genres: ["Drama"] }),
    );
    expect(explicitPrefs.providerIds).toEqual([]);
    expect(overlap.providers).toBe(false);
  });
});
