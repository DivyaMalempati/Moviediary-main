import { describe, expect, it } from "vitest";
import {
  INDIA_COLD_START_LANGUAGES,
  INDIAN_CINEMA_LANGUAGES,
} from "./languageDefaults.js";

describe("INDIA_COLD_START_LANGUAGES", () => {
  it("is India-first and includes optional English", () => {
    expect([...INDIA_COLD_START_LANGUAGES]).toEqual([
      "hi",
      "te",
      "ta",
      "ml",
      "kn",
      "bn",
      "mr",
      "en",
    ]);
  });

  it("keeps Indian cinema languages separate from English fill", () => {
    expect([...INDIAN_CINEMA_LANGUAGES]).not.toContain("en");
    expect(INDIA_COLD_START_LANGUAGES).toContain("en");
  });

  it("does not include world-cinema cold-start langs (ko/ja/fr)", () => {
    expect(INDIA_COLD_START_LANGUAGES).not.toContain("ko");
    expect(INDIA_COLD_START_LANGUAGES).not.toContain("ja");
    expect(INDIA_COLD_START_LANGUAGES).not.toContain("fr");
  });
});
