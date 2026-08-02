import { describe, expect, it } from "vitest";
import { sortFilmographyIndiaFirst } from "./tmdb.js";

describe("sortFilmographyIndiaFirst", () => {
  it("ranks Indian-language films before others", () => {
    const sorted = sortFilmographyIndiaFirst([
      { title: "Hollywood", originalLanguage: "en", voteAverage: 9 },
      { title: "Telugu hit", originalLanguage: "te", voteAverage: 7 },
      { title: "Hindi classic", originalLanguage: "hi", voteAverage: 8 },
      { title: "Korean", originalLanguage: "ko", voteAverage: 8.5 },
    ]);
    expect(sorted.map((m) => m.title)).toEqual([
      "Hindi classic",
      "Telugu hit",
      "Hollywood",
      "Korean",
    ]);
  });
});
