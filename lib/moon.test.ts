import { describe, expect, it } from "vitest";
import { litPath, moonPhaseIndex } from "./moon";

describe("moonPhaseIndex", () => {
  it("knows new moons (two solar eclipses)", () => {
    expect(moonPhaseIndex({ y: 2017, m: 8, d: 21 })).toBe(0);
    expect(moonPhaseIndex({ y: 2024, m: 4, d: 8 })).toBe(0);
  });

  it("knows full moons", () => {
    expect(moonPhaseIndex({ y: 2024, m: 4, d: 23 })).toBe(4);
    expect(moonPhaseIndex({ y: 2025, m: 1, d: 13 })).toBe(4);
  });

  it("waxes, then wanes, through all eight phases in a month", () => {
    const seen: number[] = [];
    for (let d = 8; d < 8 + 30; d++) {
      const date = new Date(Date.UTC(2024, 3, d));
      const i = moonPhaseIndex({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
      if (seen.at(-1) !== i) seen.push(i);
    }
    expect(seen.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("litPath", () => {
  it("draws nothing at new moon and a whole disc at full", () => {
    expect(litPath(0, 12, 12, 8)).toBeNull();
    expect(litPath(4, 12, 12, 8)).toMatch(/a8 8 0 1 1 0 16a8 8 0 1 1 0 -16Z$/);
  });

  it("lights the right side while waxing and the left while waning", () => {
    // The outer limb goes from the top to the bottom clockwise (through the right) when waxing.
    expect(litPath(2, 12, 12, 8)).toContain("A8 8 0 0 1 12 20");
    expect(litPath(6, 12, 12, 8)).toContain("A8 8 0 0 0 12 20");
  });
});
