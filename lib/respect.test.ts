import { describe, expect, it } from "vitest";
import { deathYear, needsRespectfulStyle, spiritEligible } from "./respect";

const now = new Date("2026-10-20T00:00:00Z");

describe("respect rules", () => {
  it("parses signed Wikidata years", () => {
    expect(deathYear({ death: "1859-11-28T00:00:00Z" })).toBe(1859);
    expect(deathYear({ death: "+1859-11-28T00:00:00Z" })).toBe(1859);
    expect(deathYear({ death: null })).toBeNull();
  });

  it("lets only the long dead into the spirit box", () => {
    expect(spiritEligible({ death: "1859-11-28T00:00:00Z" }, now)).toBe(true);
    expect(spiritEligible({ death: "1951-01-01T00:00:00Z" }, now)).toBe(true);
    expect(spiritEligible({ death: "1952-01-01T00:00:00Z" }, now)).toBe(false);
    expect(spiritEligible({ death: null }, now)).toBe(false);
  });

  it("uses the plain style for recent or unknown deaths", () => {
    expect(needsRespectfulStyle({ death: "2007-08-20T00:00:00Z" }, now)).toBe(true);
    expect(needsRespectfulStyle({ death: "2001-01-01T00:00:00Z" }, now)).toBe(false);
    expect(needsRespectfulStyle({ death: null }, now)).toBe(true);
  });

  it("reads a coarse death date at the latest year it could be", () => {
    // Q114665959: died "1950s" (stored as 1950, decade precision) could be 1959: not 75 years yet.
    const fifties = { death: "+1950-00-00T00:00:00Z", deathPrecision: 8 };
    expect(spiritEligible(fifties, now)).toBe(false);
    expect(spiritEligible({ ...fifties, death: "+1940-00-00T00:00:00Z" }, now)).toBe(true);
    // "2000s" could be 2009: within 25 years, so the plain card.
    expect(needsRespectfulStyle({ death: "+2000-00-00T00:00:00Z", deathPrecision: 8 }, now)).toBe(true);
    // A century or millennium only counts once its whole span is old enough.
    expect(spiritEligible({ death: "+1900-00-00T00:00:00Z", deathPrecision: 7 }, now)).toBe(false);
    expect(spiritEligible({ death: "+1850-00-00T00:00:00Z", deathPrecision: 7 }, now)).toBe(true);
    expect(spiritEligible({ death: "+1500-00-00T00:00:00Z", deathPrecision: 6 }, now)).toBe(false); // could be 2000
    expect(spiritEligible({ death: "+0500-00-00T00:00:00Z", deathPrecision: 6 }, now)).toBe(true);
    // Coarser than a millennium is unknown: kept out of the spirit box, plain card.
    expect(spiritEligible({ death: "-3000-00-00T00:00:00Z", deathPrecision: 5 }, now)).toBe(false);
    expect(needsRespectfulStyle({ death: "-3000-00-00T00:00:00Z", deathPrecision: 5 }, now)).toBe(true);
  });

  it("reads year, month and day precision (or none) as the stored year", () => {
    for (const deathPrecision of [9, 10, 11, null, undefined]) {
      expect(spiritEligible({ death: "1951-06-01T00:00:00Z", deathPrecision }, now)).toBe(true);
      expect(needsRespectfulStyle({ death: "2001-06-01T00:00:00Z", deathPrecision }, now)).toBe(false);
    }
  });
});
