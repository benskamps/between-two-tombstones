import { describe, expect, it } from "vitest";
import {
  acresLine,
  establishedLine,
  firstSentences,
  formatDistance,
  haversineKm,
  matchLine,
  placeLine,
} from "./format";

const NOW = new Date("2026-10-20T12:00:00Z");

describe("card lines", () => {
  it("says how old a cemetery is from its founding year only", () => {
    expect(establishedLine({ year: 1850, precision: 9 }, NOW)).toBe("Est. 1850 · 176 years old");
    expect(establishedLine({ year: 1850, precision: 8 }, NOW)).toBe("Est. 1850s");
    expect(establishedLine({ year: 1801, precision: 7 }, NOW)).toBe("Est. 19th century");
    expect(establishedLine({ year: 1701, precision: 7 }, NOW)).toBe("Est. 18th century");
    expect(establishedLine({ year: 2025, precision: 9 }, NOW)).toBe("Est. 2025 · 1 year old");
    expect(establishedLine(null, NOW)).toBeNull();
  });

  it("says the size in acres", () => {
    expect(acresLine(48)).toBe("48 acres");
    expect(acresLine(1)).toBe("1 acre");
    expect(acresLine(0.4)).toBe("0.4 acres");
    expect(acresLine(1200)).toBe("1,200 acres");
    expect(acresLine(null)).toBeNull();
  });

  it("formats distances like a person would say them", () => {
    expect(formatDistance(0.182)).toBe("200 m");
    expect(formatDistance(0.02)).toBe("100 m");
    expect(formatDistance(3.24)).toBe("3.2 km");
    expect(formatDistance(35.4)).toBe("35 km");
    expect(placeLine("Atlanta", 35.4)).toBe("Atlanta · 35 km away");
    expect(placeLine(null, 3.24)).toBe("3.2 km away");
  });

  it("writes the match line", () => {
    expect(matchLine("Oakland Cemetery", 35)).toBe("Oakland Cemetery is 35 km away. Check its hours before you go.");
  });

  it("measures great-circle distance", () => {
    // Downtown Atlanta to Oakland Cemetery: the query said 0.182 km.
    expect(haversineKm({ lat: 33.7486, lon: -84.3733 }, { lat: 33.748722, lon: -84.371333 })).toBeCloseTo(0.182, 2);
  });
});

describe("firstSentences", () => {
  it("takes two sentences", () => {
    expect(firstSentences("One is here. Two is here. Three is here.")).toBe("One is here. Two is here.");
  });

  it("doesn't stop at abbreviations or initials", () => {
    const t =
      "St. James Cemetery is in Mt. Vernon, near the U.S. Capitol. It holds W. E. B. Smith and Dr. Jones. Third.";
    expect(firstSentences(t)).toBe(
      "St. James Cemetery is in Mt. Vernon, near the U.S. Capitol. It holds W. E. B. Smith and Dr. Jones.",
    );
  });

  it("ends at Wikipedia's ', U.S.' location suffix", () => {
    // Shape of Oakland Cemetery's real intro (en.wikipedia.org, fetched 2026-10-20).
    const t =
      "Oakland Cemetery is one of the largest cemetery green spaces in Atlanta, Georgia, U.S. Founded as Atlanta Cemetery in 1850, it was renamed in 1872. By that time, the city had grown.";
    expect(firstSentences(t)).toBe(
      "Oakland Cemetery is one of the largest cemetery green spaces in Atlanta, Georgia, U.S. Founded as Atlanta Cemetery in 1850, it was renamed in 1872.",
    );
  });

  it("returns short text whole and collapses whitespace", () => {
    expect(firstSentences("Only one\n\nsentence here")).toBe("Only one sentence here");
  });

  it("ends a sentence at a year", () => {
    expect(firstSentences("It opened in 1850. It grew. It stayed.")).toBe("It opened in 1850. It grew.");
  });
});
