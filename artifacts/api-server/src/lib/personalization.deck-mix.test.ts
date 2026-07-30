import { describe, expect, it } from "vitest";
import { assembleDeckMix, type SwipeCandidate } from "./personalization.js";

function film(id: number, source?: SwipeCandidate["source"]): SwipeCandidate {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    posterPath: `/p${id}.jpg`,
    releaseYear: 2020,
    originalLanguage: "hi",
    overview: null,
    genres: ["Action"],
    source,
  };
}

describe("assembleDeckMix 60/20/20", () => {
  it("builds a 12-card deck with ~60% safe, 20% streaming, 20% wildcard", () => {
    const pools = {
      safe: Array.from({ length: 20 }, (_, i) => film(i + 1, "safe")),
      streaming: Array.from({ length: 10 }, (_, i) => film(100 + i, "streaming")),
      wildcard: Array.from({ length: 10 }, (_, i) => film(200 + i, "wildcard")),
    };

    const deck = assembleDeckMix(pools, { safe: 0.6, streaming: 0.2, wildcard: 0.2 }, 12, {
      shuffleResult: false,
    });

    expect(deck).toHaveLength(12);
    const counts = deck.reduce(
      (acc, c) => {
        acc[c.source ?? "safe"] = (acc[c.source ?? "safe"] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    // 12 * 0.6 → 7, 12 * 0.2 → 2 twice (=11); remainder +1 goes to safe → 8/2/2
    expect(counts.safe).toBe(8);
    expect(counts.streaming).toBe(2);
    expect(counts.wildcard).toBe(2);
    expect((counts.safe ?? 0) + (counts.streaming ?? 0) + (counts.wildcard ?? 0)).toBe(12);
  });

  it("fills from leftovers when a bucket is short", () => {
    const pools = {
      safe: [film(1, "safe"), film(2, "safe")],
      streaming: [] as SwipeCandidate[],
      wildcard: [film(3, "wildcard")],
    };
    const deck = assembleDeckMix(pools, { safe: 0.6, streaming: 0.2, wildcard: 0.2 }, 12, {
      shuffleResult: false,
    });
    expect(deck.length).toBeLessThanOrEqual(3);
    expect(deck.map((d) => d.tmdbId).sort()).toEqual([1, 2, 3]);
  });
});
