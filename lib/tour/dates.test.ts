import { describe, expect, it } from "vitest";
import { ageAtDeath, formatAge, formatWikiDate, parseWikiDate } from "./dates";
import { diedDuring } from "./periods";

describe("dates", () => {
  it("formats only the precision Wikidata has", () => {
    expect(formatWikiDate(parseWikiDate("1783-04-03T00:00:00Z", 11))).toBe("April 3, 1783");
    expect(formatWikiDate(parseWikiDate("1783-04-01T00:00:00Z", 10))).toBe("April 1783");
    expect(formatWikiDate(parseWikiDate("1783-01-01T00:00:00Z", 9))).toBe("1783");
    expect(formatWikiDate(parseWikiDate("1780-01-01T00:00:00Z", 8))).toBe("the 1780s");
    expect(formatWikiDate(parseWikiDate("1801-01-01T00:00:00Z", 7))).toBe("the 19th century");
    expect(formatWikiDate(parseWikiDate("+1859-11-28T00:00:00Z", 11))).toBe("November 28, 1859");
    expect(formatWikiDate(parseWikiDate("-0043-03-15T00:00:00Z", 9))).toBe("44 BC");
    expect(formatWikiDate(parseWikiDate(null, null))).toBeNull();
  });

  it("computes age at death: exact with full dates, 'about' otherwise", () => {
    // Washington Irving: April 3, 1783 – November 28, 1859.
    const irving = ageAtDeath(parseWikiDate("1783-04-03T00:00:00Z", 11), parseWikiDate("1859-11-28T00:00:00Z", 11));
    expect(irving).toEqual({ years: 76, exact: true });
    expect(formatAge(irving)).toBe("aged 76");
    // The day before a birthday doesn't count the year.
    expect(ageAtDeath(parseWikiDate("1900-11-09T00:00:00Z", 11), parseWikiDate("1949-08-16T00:00:00Z", 11))).toEqual({ years: 48, exact: true });
    const approx = ageAtDeath(parseWikiDate("1870-01-01T00:00:00Z", 9), parseWikiDate("1965-04-10T00:00:00Z", 11));
    expect(formatAge(approx)).toBe("aged about 95");
    expect(ageAtDeath(null, parseWikiDate("1965-04-10T00:00:00Z", 11))).toBeNull();
  });
});

describe("died during", () => {
  it("states timing for deaths inside a period", () => {
    expect(diedDuring("1861-12-18T00:00:00Z", 11)).toEqual(["Died during the American Civil War"]);
    expect(diedDuring("1919-08-11T00:00:00Z", 11)).toEqual(["Died during the 1918 flu pandemic"]);
    expect(diedDuring("1918-10-01T00:00:00Z", 11)).toEqual(["Died during World War I", "Died during the 1918 flu pandemic"]);
    expect(diedDuring("1944-01-01T00:00:00Z", 9)).toEqual(["Died during World War II"]);
  });

  it("never claims a period the date can't place inside it", () => {
    // Year-only 1865: the Civil War ended in May, so we can't say.
    expect(diedDuring("1865-01-01T00:00:00Z", 9)).toEqual([]);
    // Year-only 1918: the pandemic started in February and WWI ended in November.
    expect(diedDuring("1918-01-01T00:00:00Z", 9)).toEqual([]);
    expect(diedDuring("1949-08-16T00:00:00Z", 11)).toEqual([]);
    expect(diedDuring(null, null)).toEqual([]);
  });

  it("only ever says 'Died during', never a cause", () => {
    for (const line of diedDuring("1918-10-01T00:00:00Z", 11)) expect(line).toMatch(/^Died during /);
  });
});
