// GET /api/gravitator?lat=33.7486&lon=-84.3733&radius=25: query checks and the
// handler body, kept out of the route file so they can be unit-tested.

import { DeckSourceError } from "./deck";
import { RADII, type Deck, type DeckError, type RadiusKm } from "./types";

export type DeckParams = { lat: number; lon: number; radiusKm: RadiusKm };

export function parseDeckParams(search: URLSearchParams): DeckParams | { error: string } {
  const lat = Number(search.get("lat"));
  const lon = Number(search.get("lon"));
  if (!search.get("lat") || !search.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { error: "Send lat and lon as numbers, like ?lat=33.7486&lon=-84.3733." };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { error: "lat must be between -90 and 90, lon between -180 and 180." };
  }
  const r = Number(search.get("radius") ?? 25);
  // Capped: 25 km by default, 50 km when the deck runs out.
  const radiusKm: RadiusKm = (RADII as readonly number[]).includes(r) ? (r as RadiusKm) : 25;
  return { lat, lon, radiusKm };
}

function json(body: Deck | DeckError, status: number, cache: string): Response {
  return Response.json(body, { status, headers: { "Cache-Control": cache } });
}

export const WIKIDATA_DOWN = "Couldn't reach Wikidata. Try again in a minute.";

/** The route body. `getDeck` is injected so tests can run it without the network or Next's cache. */
export async function handleDeckRequest(
  url: string,
  getDeck: (lat: number, lon: number, radiusKm: number) => Promise<Deck>,
  round: (lat: number, lon: number) => { lat: number; lon: number },
  env: { DISABLE_WIKIDATA?: string } = {},
): Promise<Response> {
  const params = parseDeckParams(new URL(url).searchParams);
  if ("error" in params) return json({ error: { source: "request", message: params.error } }, 400, "no-store");
  // Gate 8: simulate a Wikidata outage.
  if (env.DISABLE_WIKIDATA === "1") {
    return json({ error: { source: "Wikidata", message: WIKIDATA_DOWN } }, 503, "no-store");
  }
  const p = round(params.lat, params.lon);
  try {
    const deck = await getDeck(p.lat, p.lon, params.radiusKm);
    const cache = deck.notes.length > 0 ? "public, max-age=60" : "public, max-age=600, s-maxage=3600";
    return json(deck, 200, cache);
  } catch (err) {
    // The profiles query is the only part that throws (everything else degrades
    // to a note), so a failure here is Wikidata's. In production the message of
    // an error thrown inside a cached function may be replaced, so we don't
    // depend on it.
    const message = err instanceof DeckSourceError ? err.message : WIKIDATA_DOWN;
    console.error("gravitator: deck failed", err instanceof Error ? err.message : err);
    return json({ error: { source: "Wikidata", message } }, 502, "no-store");
  }
}
