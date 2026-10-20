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
});
