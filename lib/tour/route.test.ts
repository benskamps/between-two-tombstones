import { describe, expect, it } from "vitest";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import type { CemeterySnapshot } from "@/lib/types";
import { buildStops, canRoute, locatedGraves, PAGE_SIZE } from "./modes";
import { distanceM, MAX_TWO_OPT_ITERATIONS, pathLength, planRoute, type Stop } from "./route";
import { rankPeople } from "./score";

const now = new Date("2026-10-20T00:00:00Z");
const oak = oakland as CemeterySnapshot;

describe("walking route", () => {
  it("measures distance in metres", () => {
    // 0.001° of latitude ≈ 111 m.
    expect(distanceM({ lat: 33.748, lon: -84.371 }, { lat: 33.749, lon: -84.371 })).toBeCloseTo(111.2, 0);
  });

  it("orders points along a line without zig-zagging", () => {
    const stops: Stop[] = [0, 4, 1, 3, 2].map((i) => ({ id: `s${i}`, lat: 33.748 + i * 0.0005, lon: -84.371 }));
    const plan = planRoute(stops, { lat: 33.7475, lon: -84.371 });
    expect(plan.stops.map((s) => s.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  });

  it("2-opt never makes the greedy path longer, and stays under the iteration cap", () => {
    // A ring of points: nearest neighbor alone can cross itself.
    const stops: Stop[] = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`,
      lat: 33.748 + 0.002 * Math.sin((i * 7 * Math.PI) / 20),
      lon: -84.371 + 0.002 * Math.cos((i * 7 * Math.PI) / 20),
    }));
    const planned = planRoute(stops);
    const greedyOnly = planRoute(stops, null, 0);
    expect(planned.lengthM).toBeLessThanOrEqual(greedyOnly.lengthM);
    expect(planned.iterations).toBeLessThanOrEqual(MAX_TWO_OPT_ITERATIONS);
    expect(new Set(planned.stops.map((s) => s.id)).size).toBe(40);
    expect(pathLength(planned.stops)).toBeCloseTo(planned.lengthM, -1);
  });
});

describe("tour modes", () => {
  const ranked = rankPeople(oak.people, { now, cemeteryName: oak.cemetery.name });

  it("greatest hits shows 12 stops by default", () => {
    const t = buildStops(ranked, "hits", PAGE_SIZE, new Map());
    expect(t.stops).toHaveLength(12);
    expect(t.stops[0].person.name).toBe("Margaret Mitchell");
    expect(t.remaining).toBe(oak.people.length - 12);
  });

  it("walk through time orders the same stops by birth", () => {
    const hits = buildStops(ranked, "hits", PAGE_SIZE, new Map());
    const time = buildStops(ranked, "time", PAGE_SIZE, new Map());
    expect(new Set(time.stops.map((s) => s.person.qid))).toEqual(new Set(hits.stops.map((s) => s.person.qid)));
    const births = time.stops.map((s) => s.person.birth).filter(Boolean) as string[];
    expect([...births].sort()).toEqual(births);
  });

  it("route mode needs 3 located graves: Oakland has fewer on Wikidata; pins fill the gap", () => {
    const fromWikidata = locatedGraves(oak.people, {});
    expect(fromWikidata.size).toBeLessThan(3); // 2 on Oct 20
    expect(canRoute(fromWikidata)).toBe(false);
    expect(buildStops(ranked, "route", PAGE_SIZE, fromWikidata).mode).toBe("hits");

    const unlocated = ranked.map((s) => s.person.qid).filter((q) => !fromWikidata.has(q));
    const pins = Object.fromEntries(
      unlocated.slice(0, 3 - fromWikidata.size).map((q, i) => [q, { personQid: q, lat: 33.7489 + i * 0.0003, lon: -84.3712 }]),
    );
    const located = locatedGraves(oak.people, pins);
    expect(canRoute(located)).toBe(true);
    const route = buildStops(ranked, "route", PAGE_SIZE, located);
    expect(route.mode).toBe("route");
    expect(route.stops.map((s) => s.person.qid).sort()).toEqual([...located.keys()].sort());
    expect(route.routeLengthM).toBeGreaterThan(0);
  });

  it("a pin overrides Wikidata's coordinate", () => {
    const located = locatedGraves(oak.people, { Q1100228: { personQid: "Q1100228", lat: 1, lon: 2 } });
    expect(located.get("Q1100228")).toEqual({ lat: 1, lon: 2 });
  });
});
