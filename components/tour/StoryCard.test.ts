import { describe, expect, it } from "vitest";
import { parseWikiDate } from "@/lib/tour/dates";
import { shortDate } from "./StoryCard";

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
