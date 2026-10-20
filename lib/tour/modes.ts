// Tour modes. "Greatest hits" (default) orders by score; "Walk through time"
// takes the same top stops and orders them by birth; "Best walking route"
// appears only with 3+ located graves (Wikidata coordinates or the visitor's
// own "I found it" pins) and orders those by a short walking path.

import { parsePoint, type Person } from "@/lib/types";
import { dateKey, parseWikiDate } from "./dates";
import { planRoute, type Point } from "./route";
import type { Scored } from "./score";

export type Mode = "hits" | "time" | "route";

export const MODES: { id: Mode; label: string }[] = [
  { id: "hits", label: "Greatest hits" },
  { id: "time", label: "Walk through time" },
  { id: "route", label: "Best walking route" },
];

export const PAGE_SIZE = 12;
export const MIN_ROUTE_STOPS = 3;

export type PinLike = { personQid: string; lat: number; lon: number };

/** Where each located grave is: the visitor's pin wins over Wikidata's coordinate. */
export function locatedGraves(people: Person[], pins: Record<string, PinLike>): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const p of people) {
    const pin = pins[p.qid];
    if (pin) out.set(p.qid, { lat: pin.lat, lon: pin.lon });
    else {
      const at = parsePoint(p.graveCoord);
      if (at) out.set(p.qid, at);
    }
  }
  return out;
}

export function canRoute(located: Map<string, Point>): boolean {
  return located.size >= MIN_ROUTE_STOPS;
}

function birthOrder(s: Scored): number {
  return (
    dateKey(parseWikiDate(s.person.birth, s.person.birthPrecision)) ??
    dateKey(parseWikiDate(s.person.death, s.person.deathPrecision)) ??
    Number.MAX_SAFE_INTEGER
  );
}

export type TourStops = {
  mode: Mode;
  stops: Scored[];
  /** How many more stops "show more" could add. */
  remaining: number;
  /** Route mode only: total walking distance in metres. */
  routeLengthM?: number;
};

/**
 * `ranked` is greatest-hits order (rankPeople). `count` is how many stops are
 * showing. Route mode falls back to greatest hits when fewer than 3 graves are located.
 */
export function buildStops(
  ranked: Scored[],
  mode: Mode,
  count: number,
  located: Map<string, Point>,
  start: Point | null = null,
): TourStops {
  if (mode === "route" && canRoute(located)) {
    const candidates = ranked.filter((s) => located.has(s.person.qid));
    const plan = planRoute(
      candidates.map((s) => ({ id: s.person.qid, ...located.get(s.person.qid)! })),
      start,
    );
    const byQid = new Map(candidates.map((s) => [s.person.qid, s]));
    const ordered = plan.stops.map((st) => byQid.get(st.id)!);
    return {
      mode,
      stops: ordered.slice(0, count),
      remaining: Math.max(0, ordered.length - count),
      routeLengthM: plan.lengthM,
    };
  }
  const top = ranked.slice(0, count);
  const effective: Mode = mode === "route" ? "hits" : mode;
  const stops = effective === "time" ? [...top].sort((a, b) => birthOrder(a) - birthOrder(b)) : top;
  return { mode: effective, stops, remaining: Math.max(0, ranked.length - count) };
}
