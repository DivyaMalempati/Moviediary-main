import { describe, expect, it } from "vitest";
import { underratedReleaseWindow, UNDERRATED_YEARS_BACK } from "./tmdb.js";

describe("underratedReleaseWindow", () => {
  it("spans the last N years ending today", () => {
    const { primaryReleaseDateGte, primaryReleaseDateLte } = underratedReleaseWindow(10);
    const end = new Date(primaryReleaseDateLte);
    const start = new Date(primaryReleaseDateGte);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(Number.isNaN(start.getTime())).toBe(false);

    const years =
      (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(years).toBeGreaterThan(9.5);
    expect(years).toBeLessThan(10.5);

    const today = new Date();
    expect(primaryReleaseDateLte).toBe(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    );
  });

  it("defaults to UNDERRATED_YEARS_BACK", () => {
    expect(UNDERRATED_YEARS_BACK).toBe(10);
    const a = underratedReleaseWindow();
    const b = underratedReleaseWindow(10);
    expect(a).toEqual(b);
  });
});
