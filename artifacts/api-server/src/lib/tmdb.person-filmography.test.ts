import { describe, expect, it } from "vitest";
import { sortFilmographyIndiaFirst } from "./tmdb.js";

describe("sortFilmographyIndiaFirst", () => {
  it("ranks Indian-language films before others, then by popularity", () => {
    const sorted = sortFilmographyIndiaFirst([
      { title: "Hollywood", originalLanguage: "en", voteAverage: 9, popularity: 50 },
      { title: "Telugu hit", originalLanguage: "te", voteAverage: 7, popularity: 5 },
      { title: "Hindi classic", originalLanguage: "hi", voteAverage: 8, popularity: 20 },
      { title: "Korean", originalLanguage: "ko", voteAverage: 8.5, popularity: 40 },
    ]);
    expect(sorted.map((m) => m.title)).toEqual([
      "Hindi classic",
      "Telugu hit",
      "Hollywood",
      "Korean",
    ]);
  });

  it("within Indian languages, higher popularity wins", () => {
    const sorted = sortFilmographyIndiaFirst([
      { title: "Older", originalLanguage: "ta", popularity: 2 },
      { title: "Hit", originalLanguage: "ta", popularity: 20 },
    ]);
    expect(sorted.map((m) => m.title)).toEqual(["Hit", "Older"]);
  });
});
