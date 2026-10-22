import { describe, expect, it } from "vitest";
import { GLYPHS, REUSED_IDS } from "@/components/games/bingoGlyphs";
import { symbolById } from "@/lib/games/symbols";
import { parseWikiDate } from "@/lib/tour/dates";
import { apexSymbols, shortDate } from "./StoryCard";

describe("shortDate (the carved inscription)", () => {
  it("abbreviates the month for day and month precision", () => {
    expect(shortDate(parseWikiDate("1900-11-08T00:00:00Z", 11))).toBe("Nov 8, 1900");
    expect(shortDate(parseWikiDate("1949-08-16T00:00:00Z", 11))).toBe("Aug 16, 1949");
    expect(shortDate(parseWikiDate("1783-04-01T00:00:00Z", 10))).toBe("Apr 1783");
    expect(shortDate(parseWikiDate("1859-05-01T00:00:00Z", 11))).toBe("May 1, 1859");
  });
  it("leaves years, decades, centuries and BC alone", () => {
    expect(shortDate(parseWikiDate("1783-01-01T00:00:00Z", 9))).toBe("1783");
    expect(shortDate(parseWikiDate("1780-01-01T00:00:00Z", 8))).toBe("the 1780s");
    expect(shortDate(parseWikiDate("-0043-03-15T00:00:00Z", 9))).toBe("44 BC");
    expect(shortDate(null)).toBeNull();
  });
});

describe("apexSymbols (the carved card's death and life signs)", () => {
  const tagSets = [[], ["famous"], ["century-gone"], ["died-young"], ["long-life"], ["century-gone", "died-young"], ["century-gone", "long-life"]];

  it("are real epitaph glyphs from the bingo set, never a tool's sign (review pass 4, P2 #2)", () => {
    for (const tags of tagSets) {
      for (const id of Object.values(apexSymbols(tags))) {
        expect(GLYPHS[id], id).toBeDefined();
        expect(REUSED_IDS as readonly string[]).not.toContain(id); // lily, poppy, fern and the candle are tool signs
        expect(symbolById(id)?.meaning, id).toBeTruthy();
      }
    }
  });

  it("follow why the grave is on the tour", () => {
    expect(apexSymbols(["died-young"])).toEqual({ death: "broken-column", life: "rosebud" });
    expect(apexSymbols(["long-life"])).toEqual({ death: "wheat-sheaf", life: "oak-leaves" });
    expect(apexSymbols(["century-gone"])).toEqual({ death: "draped-urn", life: "ivy" });
    expect(apexSymbols(["century-gone", "died-young"])).toEqual({ death: "broken-column", life: "rosebud" });
    expect(apexSymbols(["famous"])).toEqual({ death: "weeping-willow", life: "laurel-wreath" });
  });
});
