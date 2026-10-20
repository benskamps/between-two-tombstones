import { describe, expect, it } from "vitest";
import { parseLatLon, parseQid, parseQuery } from "./validate";

describe("input validation", () => {
  it("accepts QIDs, upper-casing them, and rejects anything else", () => {
    expect(parseQid("Q2008469")).toEqual({ ok: true, qid: "Q2008469" });
    expect(parseQid("q360779")).toEqual({ ok: true, qid: "Q360779" });
    for (const bad of ["", "Q", "Q0", "P31", "Q1/../x", "Q123456789012345", null]) expect(parseQid(bad).ok).toBe(false);
  });

  it("accepts lat/lon in range and rejects junk", () => {
    expect(parseLatLon("47.6339", "-122.3158")).toEqual({ ok: true, lat: 47.6339, lon: -122.3158 });
    expect(parseLatLon("-90", "180").ok).toBe(true);
    for (const [lat, lon] of [["91", "0"], ["0", "181"], ["", "0"], ["abc", "1"], ["1e3", "0"], [null, "0"], ["0x10", "0"]]) {
      expect(parseLatLon(lat, lon).ok).toBe(false);
    }
  });

  it("trims and length-checks search text", () => {
    expect(parseQuery("  lake   view ")).toEqual({ ok: true, q: "lake view" });
    expect(parseQuery("a").ok).toBe(false);
    expect(parseQuery("x".repeat(101)).ok).toBe(false);
    expect(parseQuery(null).ok).toBe(false);
  });
});
