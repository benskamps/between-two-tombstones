// Display helpers for the Gravitator cards. Pure and client-safe.

import type { GraveyardProfile } from "./types";

export const HOURS_LINE = "Public cemetery · check its hours before you go.";

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "300 m", "3.2 km", "35 km". */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** "Atlanta · 35 km away", or just the distance when the place is unknown. */
export function placeLine(place: string | null, km: number): string {
  const d = `${formatDistance(km)} away`;
  return place ? `${place} · ${d}` : d;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * "Est. 1850 · 176 years old" for a year; "Est. 1850s" for a decade;
 * "Est. 19th century" for a century. Only the year is ever shown.
 */
export function establishedLine(est: GraveyardProfile["established"], now = new Date()): string | null {
  if (!est) return null;
  const { year, precision } = est;
  if (precision >= 9) {
    const age = now.getUTCFullYear() - year;
    if (age < 1) return `Est. ${year}`;
    return `Est. ${year} · ${age} ${age === 1 ? "year" : "years"} old`;
  }
  if (precision === 8) return `Est. ${Math.floor(year / 10) * 10}s`;
  if (precision === 7) {
    const century = year > 0 ? Math.floor((year - 1) / 100) + 1 : null;
    return century ? `Est. ${ordinal(century)} century` : null;
  }
  return null;
}

/** "48 acres", "1 acre", "0.4 acres". */
export function acresLine(acres: number | null): string | null {
  if (acres === null || !Number.isFinite(acres) || acres <= 0) return null;
  return `${acres.toLocaleString("en-US")} ${acres === 1 ? "acre" : "acres"}`;
}

/** Capitalize the first letter of a Wikidata label for display. */
export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const ABBREVIATIONS = new Set([
  "st", "mt", "ft", "dr", "mr", "mrs", "ms", "jr", "sr", "gen", "col", "lt", "capt", "rev", "gov", "sen", "rep",
  "no", "co", "inc", "ca", "c", "vs", "etc", "u.s", "u.k", "d.c", "a.m", "p.m", "approx", "est", "ave", "blvd",
]);

/**
 * The first `n` sentences of a plain-text intro. Splits on ". ", "! ", "? "
 * followed by a capital or a quote, skipping common abbreviations and initials
 * ("St.", "Mt.", "U.S.", "W. E. B.").
 */
export function firstSentences(text: string, n = 2): string {
  const t = text.replace(/\s+/g, " ").trim();
  let count = 0;
  const re = /([.!?])["”’)]?\s+(?=["“(A-Z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m[1] === ".") {
      const before = t.slice(0, m.index);
      const word = before.split(/\s/).pop() ?? "";
      const bare = word.replace(/^[("“]+/, "").toLowerCase();
      // Wikipedia ends location phrases with ", U.S." ("Atlanta, Georgia, U.S. Founded…"): that one does end it.
      const countryEnd = (bare === "u.s" || bare === "u.k") && /,\s*\S+$/.test(before);
      // Single initials ("W.", "E.") and known abbreviations don't end a sentence.
      if (!countryEnd && (/^[a-z]$/i.test(bare) || ABBREVIATIONS.has(bare))) continue;
    }
    count++;
    if (count >= n) return t.slice(0, m.index + m[0].trimEnd().length).trim();
  }
  return t;
}

export function findAGraveUrl(id: string): string {
  return `https://www.findagrave.com/cemetery/${encodeURIComponent(id)}`;
}

export function commonsFileUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}

export function tourHref(qid: string): string {
  return `/cemetery/${encodeURIComponent(qid)}`;
}

/** "It's a match. Oakland Cemetery is 35 km away. Check its hours before you go." */
export function matchLine(name: string, km: number): string {
  return `${name} is ${formatDistance(km)} away. Check its hours before you go.`;
}

/** A few words for the screen reader when a card gets focus. */
export function cardLabel(p: Pick<GraveyardProfile, "name" | "place">, km: number, index: number, total: number): string {
  return `${p.name}. ${placeLine(p.place, km)}. Cemetery ${index + 1} of ${total}.`;
}
