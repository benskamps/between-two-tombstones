// What /near does with the list it already has (F2, F17). Pure functions over
// the near query's own counts: nothing here asks Wikidata for more.
//
// URL contract with the home page and the cemetery hub (Lane 10):
// - The location button opens /near?lat=…&lon=…&acc=<meters>. No acc: never auto-open.
// - A cemetery picked from the list opens /cemetery/<qid>?via=near.
// - Auto-open goes to /cemetery/<qid>?via=here&lat=…&lon=…; the hub's
//   "Not here? See the others" links back to /near?lat=…&lon=…&list=1.
// - list=1 turns auto-open off.

import type { NearbyCemetery } from "./types";

/** "Best stories nearby": the cemetery with the most people listed among those with this many… */
export const BEST_MIN_PEOPLE = 10;
/** …within this distance; otherwise the nearest with FALLBACK_MIN_PEOPLE at any distance. */
export const BEST_MAX_KM = 2;
export const FALLBACK_MIN_PEOPLE = 5;

/** "I'm here. Haunt me." opens a tour straight away only for a cemetery this close… */
export const AUTO_OPEN_MAX_KM = 0.3;
/** …with this many people listed… */
export const AUTO_OPEN_MIN_PEOPLE = 5;
/** …and only when the phone's fix is at least this good. Worse than this, we say so. */
export const MAX_ACCURACY_M = 300;
/** Another cemetery with 5+ people this close makes "which one are you in?" a guess. */
export const AUTO_OPEN_RIVAL_KM = 0.6;

const nearestFirst = (list: NearbyCemetery[]) => [...list].sort((a, b) => a.distanceKm - b.distanceKm);

/** /near starts loading the nearest cemetery with 5+ people within 1 km before anyone taps… */
export const WARM_MIN_PEOPLE = 5;
export const WARM_MAX_KM = 1;

/**
 * The pinned card: among cemeteries with 10+ people within 2 km, the one with
 * the most people listed (ties: the nearer); if none, the nearest with 5+;
 * else null. Most people, not nearest: at Laurel Hill's south edge the nearest
 * with 10+ is Mount Vernon (26 people, 260 m), next to Laurel Hill (557, 550 m).
 */
export function bestNearby(list: NearbyCemetery[]): NearbyCemetery | null {
  const sorted = nearestFirst(list);
  const big = sorted.filter((c) => c.burials >= BEST_MIN_PEOPLE && c.distanceKm <= BEST_MAX_KM);
  if (big.length > 0) return big.reduce((a, b) => (b.burials > a.burials ? b : a));
  return sorted.find((c) => c.burials >= FALLBACK_MIN_PEOPLE) ?? null;
}

/**
 * The cemetery to open without showing the list: the nearest with 5+ people
 * within 300 m, with a fix of ±300 m or better, and only when that is not a
 * guess: it is also the pinned "Best stories nearby" pick, or no other
 * cemetery with 5+ people is within 600 m. Unknown accuracy, a worse fix,
 * list=1, or two cemeteries in play → null (show the list with the pin).
 */
export function autoOpenTarget(list: NearbyCemetery[], accuracyM: number | null, listRequested = false): NearbyCemetery | null {
  if (listRequested || accuracyM === null || accuracyM > MAX_ACCURACY_M) return null;
  const sorted = nearestFirst(list);
  const target = sorted.find((c) => c.burials >= AUTO_OPEN_MIN_PEOPLE && c.distanceKm <= AUTO_OPEN_MAX_KM);
  if (!target) return null;
  if (bestNearby(list)?.qid === target.qid) return target;
  const rival = sorted.some((c) => c.qid !== target.qid && c.burials >= AUTO_OPEN_MIN_PEOPLE && c.distanceKm <= AUTO_OPEN_RIVAL_KM);
  return rival ? null : target;
}

/**
 * The tours /near loads ahead of a tap: the nearest cemetery with 5+ people
 * within 1 km (where you're standing; an auto-open target is always this one),
 * plus the pinned "Best stories nearby" card when it is a different cemetery,
 * since that is the most likely tap (Magnolia at 1.7 km from the Charleston
 * point). Pass best = null when /near is about to auto-open. At most 2 QIDs:
 * one extra cemetery per render, because Wikimedia's limits are tight.
 */
export function warmTargets(list: NearbyCemetery[], best: NearbyCemetery | null): string[] {
  const here = nearestFirst(list).find((c) => c.burials >= WARM_MIN_PEOPLE);
  const out = here && here.distanceKm <= WARM_MAX_KM ? [here.qid] : [];
  if (best && !out.includes(best.qid)) out.push(best.qid);
  return out;
}

/** acc in meters from the URL; null when missing or not a plain non-negative number. */
export function parseAccuracy(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = raw.trim();
  if (!/^\d{1,7}(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** True for list=1 (also "true"/"yes"). */
export function parseFlag(raw: string | undefined | null): boolean {
  return raw !== undefined && raw !== null && /^(1|true|yes)$/i.test(raw.trim());
}

/** "±450 m", "±1.2 km", "±15 km": 10 m steps under a kilometre, then 0.1 km, then whole km. */
export function accuracyText(m: number): string {
  if (m < 995) return `±${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  if (km < 9.95) return `±${km.toFixed(1).replace(/\.0$/, "")} km`;
  return `±${Math.round(km)} km`;
}

/** True when the fix is too rough to trust for "you're here". */
export function isApproximate(accuracyM: number | null): accuracyM is number {
  return accuracyM !== null && accuracyM > MAX_ACCURACY_M;
}

/** Split the rest of the list: cemeteries with people listed (links) and those with none (plain text). */
export function splitNear(list: NearbyCemetery[], best: NearbyCemetery | null): { listed: NearbyCemetery[]; unlisted: NearbyCemetery[] } {
  const rest = nearestFirst(list).filter((c) => c.qid !== best?.qid);
  return { listed: rest.filter((c) => c.burials > 0), unlisted: rest.filter((c) => c.burials <= 0) };
}

export function distanceText(km: number): string {
  return km < 1 ? `${Math.round((km * 1000) / 10) * 10} m away` : `${km.toFixed(1)} km away`;
}

export function peopleText(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"} listed on Wikidata`;
}

/** A cemetery picked from the near list. */
export function nearHref(qid: string): string {
  return `/cemetery/${qid}?via=near`;
}

/** Auto-open: the hub knows the visitor is standing here, and where to send "Not here?". */
export function hereHref(qid: string, lat: number, lon: number): string {
  return `/cemetery/${qid}?${new URLSearchParams({ via: "here", lat: String(lat), lon: String(lon) })}`;
}
