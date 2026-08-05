import { describe, expect, it } from "vitest";
import {
  TROPE_KEYWORDS,
  tropeBySlug,
  tropeKeywordIdsOr,
} from "./tropes.js";

describe("trope keyword catalog", () => {
  it("maps treasure-hunt to the real TMDB treasure hunt keyword", () => {
    expect(tropeBySlug("treasure-hunt")?.keywordId).toBe(6956);
    expect(tropeBySlug("treasure-hunt")?.keywordId).not.toBe(10292); // gore
  });

  it("maps serial-killer and twist-ending to live TMDB keywords", () => {
    expect(tropeBySlug("serial-killer")?.keywordId).toBe(10714);
    expect(tropeBySlug("twist-ending")?.keywordId).toBe(326438);
    expect(tropeBySlug("heist")?.keywordId).toBe(10051);
  });

  it("ORs related keywords for treasure-hunt India coverage", () => {
    const trope = tropeBySlug("treasure-hunt");
    expect(trope).toBeTruthy();
    const ids = tropeKeywordIdsOr(trope!);
    expect(ids[0]).toBe(6956);
    expect(ids).toEqual(expect.arrayContaining([1454, 169953, 207372]));
  });

  it("seeds known Indian treasure / quest titles for treasure-hunt", () => {
    const seeds = tropeBySlug("treasure-hunt")?.indiaSeedTmdbIds ?? [];
    expect(seeds).toEqual(expect.arrayContaining([401285, 412197, 891445]));
  });

  it("maps investigative / suspense vibes to live TMDB keywords", () => {
    expect(tropeBySlug("forensic-investigation")?.keywordId).toBe(160313);
    expect(tropeBySlug("investigative-thriller")?.keywordId).toBe(158927);
    expect(tropeBySlug("crime-thriller")?.keywordId).toBe(355372);
    expect(tropeBySlug("suspense")?.keywordId).toBe(288394);
  });

  it("uses Crime∧Thriller genres for crime-thriller India coverage", () => {
    expect(tropeBySlug("crime-thriller")?.genreIdsAnd).toEqual([80, 53]);
    expect(tropeBySlug("investigative-thriller")?.genreIdsAnd).toEqual([80, 9648]);
  });

  it("seeds known Indian crime / investigative titles", () => {
    const crimeSeeds = tropeBySlug("crime-thriller")?.indiaSeedTmdbIds ?? [];
    expect(crimeSeeds).toEqual(expect.arrayContaining([247652, 534780, 84332]));
  });

  it("uses unique primary keyword ids", () => {
    const ids = TROPE_KEYWORDS.map((t) => t.keywordId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
