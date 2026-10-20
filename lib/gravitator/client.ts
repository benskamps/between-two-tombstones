// Browser side of GET /api/gravitator: fetch, check the shape, and run the
// public filter again before anything reaches the screen (defense in depth:
// a card that says family, private, pet or abandoned never renders).

import { isPublicCemetery } from "./parse";
import type { Deck, GraveyardProfile, NotablePerson } from "./types";

export type DeckResult =
  | { ok: true; deck: Deck }
  | { ok: false; kind: "offline" | "source" | "timeout"; message: string };

export const OFFLINE_MESSAGE =
  "You're offline. The deck needs a connection to Wikidata. Your saved graveyards still open.";
export const TIMEOUT_MESSAGE = "Wikidata took too long to answer. Try again in a minute.";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

function person(raw: unknown): NotablePerson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const qid = str(r.qid);
  const name = str(r.name);
  if (!qid || !name) return null;
  // Unknown → treated as recent: name only (lib/respect.ts).
  return { qid, name, deathYear: num(r.deathYear), recent: r.recent !== false };
}

export function toProfile(raw: unknown): GraveyardProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const qid = str(r.qid);
  const name = str(r.name);
  const lat = num(r.lat);
  const lon = num(r.lon);
  if (!qid || !/^Q[1-9]\d*$/.test(qid) || !name || lat === null || lon === null) return null;
  const est = r.established as Record<string, unknown> | null | undefined;
  const bio = r.bio as Record<string, unknown> | null | undefined;
  const notable = r.notable as Record<string, unknown> | null | undefined;
  const image = str(r.image);
  return {
    qid,
    name,
    place: str(r.place),
    lat,
    lon,
    distanceKm: num(r.distanceKm) ?? 0,
    // Only Commons images: anything else would be blocked by the CSP anyway.
    image: image && image.startsWith("https://commons.wikimedia.org/") ? image : null,
    imageFile: str(r.imageFile),
    established:
      est && num(est.year) !== null && num(est.precision) !== null
        ? { year: num(est.year)!, precision: num(est.precision)! }
        : null,
    acres: num(r.acres),
    heritage: strs(r.heritage),
    typeIds: strs(r.typeIds),
    types: strs(r.types),
    findAGraveId: str(r.findAGraveId),
    enwiki: str(r.enwiki),
    bio: bio && str(bio.intro) && str(bio.url) ? { intro: str(bio.intro)!, url: str(bio.url)! } : null,
    notable:
      notable && num(notable.count) !== null
        ? {
            count: num(notable.count)!,
            top: (Array.isArray(notable.top) ? notable.top : [])
              .map(person)
              .filter((p): p is NotablePerson => p !== null)
              .slice(0, 3),
          }
        : null,
  };
}

/** API JSON → Deck with only valid, public cards; null when it isn't a deck. */
export function parseDeckResponse(json: unknown): Deck | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (!Array.isArray(j.cards)) return null;
  const center = j.center as Record<string, unknown> | undefined;
  const byQid = new Map<string, GraveyardProfile>();
  for (const c of j.cards.map(toProfile)) {
    if (c && isPublicCemetery(c) && !byQid.has(c.qid)) byQid.set(c.qid, c);
  }
  const cards = [...byQid.values()];
  const notes = Array.isArray(j.notes)
    ? j.notes
        .map((n) => n as Record<string, unknown>)
        .filter((n) => (n.source === "Wikidata" || n.source === "Wikipedia") && str(n.message))
        .map((n) => ({ source: n.source as "Wikidata" | "Wikipedia", message: str(n.message)! }))
    : [];
  return {
    center: { lat: num(center?.lat) ?? 0, lon: num(center?.lon) ?? 0 },
    radiusKm: num(j.radiusKm) ?? 25,
    fetchedAt: str(j.fetchedAt) ?? "",
    total: Math.max(num(j.total) ?? cards.length, cards.length),
    excluded: num(j.excluded) ?? 0,
    cards,
    notes,
  };
}

/** The error message the API sent, naming its source; or a generic one. */
export function errorMessage(json: unknown, status: number): string {
  const e = (json as { error?: { source?: unknown; message?: unknown } } | null)?.error;
  const message = str(e?.message);
  if (message) return message;
  const source = str(e?.source);
  if (source && source !== "request") return `Couldn't reach ${source}. Try again in a minute.`;
  return status >= 500 ? "Couldn't reach Wikidata. Try again in a minute." : "That location didn't work. Try another.";
}

const CLIENT_TIMEOUT_MS = 65_000;

export async function fetchDeck(lat: number, lon: number, radiusKm: number, signal: AbortSignal): Promise<DeckResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, kind: "offline", message: OFFLINE_MESSAGE };
  }
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  const both = AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal;
  let res: Response;
  try {
    // Two decimals (about 1 km): the server never sees the precise point, and
    // neighbors share one cached deck. Distances are worked out here instead.
    res = await fetch(`/api/gravitator?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&radius=${radiusKm}`, {
      signal: both,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if (signal.aborted) throw err;
    if (timeout.aborted) return { ok: false, kind: "timeout", message: TIMEOUT_MESSAGE };
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return {
      ok: false,
      kind: offline ? "offline" : "source",
      message: offline ? OFFLINE_MESSAGE : "No connection to the server. Check your signal and try again.",
    };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Not JSON (a proxy error page, say).
  }
  if (!res.ok) return { ok: false, kind: "source", message: errorMessage(json, res.status) };
  const deck = parseDeckResponse(json);
  if (!deck) return { ok: false, kind: "source", message: "Wikidata sent an answer we couldn't read. Try again in a minute." };
  return { ok: true, deck };
}
