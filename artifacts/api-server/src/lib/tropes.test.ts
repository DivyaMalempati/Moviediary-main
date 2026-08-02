import { describe, expect, it } from "vitest";
import { TROPE_KEYWORDS, tropeBySlug } from "./tropes.js";

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

  it("uses unique keyword ids", () => {
    const ids = TROPE_KEYWORDS.map((t) => t.keywordId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
