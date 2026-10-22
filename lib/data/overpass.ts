// OpenStreetMap via Overpass: optional enrichment for "near" (decision 11).
// Mirrors are tried in order; if all fail, the failure is named and the
// Wikidata results stand on their own. All three mirrors were unreachable from
// the build container in Hour 0, so this path is unit-tested with fixtures.

import { DataSourceError } from "./errors";
import type { NearbyCemetery, OsmOnlyCemetery } from "./types";
import { politeJson, REQUEST_PATH } from "./wikimedia";

export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

/** Per-mirror budget; the whole fallback chain stays under ~3x this. */
const MIRROR_TIMEOUT_MS = 4_000;
const MAX_ELEMENTS = 300;

export type OsmCemetery = {
  osmId: string;
  name: string | null;
  wikidata: string | null;
  lat: number;
  lon: number;
};

type OverpassJson = {
  /** Set when the query failed on the server, e.g. 'runtime error: Query timed out in "query" at line 2 after 21 seconds.' */
  remark?: string;
  elements?: {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string | undefined>;
  }[];
};

export const overpassQuery = (lat: number, lon: number, radiusM: number) =>
  `[out:json][timeout:20];
(nwr["landuse"="cemetery"](around:${radiusM},${lat},${lon});nwr["amenity"="grave_yard"](around:${radiusM},${lat},${lon}););
out tags center ${MAX_ELEMENTS};`;

export function parseOverpass(json: OverpassJson): OsmCemetery[] {
  // Overpass answers HTTP 200 with partial or empty elements plus a remark when
  // the query timed out or ran out of memory. That's a failure, not "no
  // cemeteries": throwing keeps it out of the cache (lib/data/cached.ts stores
  // only what returns) and lets the next mirror try.
  const remark = typeof json?.remark === "string" ? json.remark : "";
  if (/runtime error|timed out|out of memory/i.test(remark)) {
    const kind = /timed out|timeout/i.test(remark) ? "timeout" : "bad-response";
    throw new DataSourceError("OpenStreetMap", kind, `Overpass answered with an error: ${remark.slice(0, 160)}`);
  }
  if (!Array.isArray(json?.elements)) {
    throw new DataSourceError("OpenStreetMap", "bad-response", "Overpass answered without elements.");
  }
  const out: OsmCemetery[] = [];
  for (const e of json.elements.slice(0, MAX_ELEMENTS)) {
    const lat = e.center?.lat ?? e.lat;
    const lon = e.center?.lon ?? e.lon;
    if (lat === undefined || lon === undefined) continue;
    const wd = e.tags?.wikidata;
    out.push({
      osmId: `${e.type}/${e.id}`,
      name: e.tags?.name?.trim() || null,
      wikidata: wd && /^Q\d+$/.test(wd) ? wd : null,
      lat,
      lon,
    });
  }
  return out;
}

/** Try each mirror in order. Throws one DataSourceError naming every mirror that failed. */
export async function fetchOsmCemeteries(lat: number, lon: number, radiusKm: number): Promise<{ mirror: string; cemeteries: OsmCemetery[] }> {
  const body = `data=${encodeURIComponent(overpassQuery(lat, lon, Math.round(radiusKm * 1000)))}`;
  const failures: string[] = [];
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const json = await politeJson<OverpassJson>(mirror, {
        source: "OpenStreetMap",
        ...REQUEST_PATH,
        init: { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
        timeoutMs: MIRROR_TIMEOUT_MS,
        deadlineMs: MIRROR_TIMEOUT_MS + 2_000,
        maxRetries: 0,
        spacingMs: 0,
      });
      return { mirror: new URL(mirror).host, cemeteries: parseOverpass(json) };
    } catch (err) {
      const host = new URL(mirror).host;
      const why = err instanceof DataSourceError ? err.kind : "unreachable";
      failures.push(`${host} (${why})`);
    }
  }
  throw new DataSourceError("OpenStreetMap", "unreachable", `All ${OVERPASS_MIRRORS.length} Overpass mirrors failed: ${failures.join(", ")}.`);
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Lowercase letters and digits only, so "Lake View Cemetery" = "Lakeview cemetery". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const NAME_MATCH_MAX_KM = 1.5;

/**
 * Merge OSM cemeteries into the Wikidata list: by QID first, then by the same
 * normalized name within 1.5 km. Wikidata entries keep their data (they carry
 * the burials); OSM-only named cemeteries are returned separately.
 */
export function mergeOsm(
  wikidata: NearbyCemetery[],
  osm: OsmCemetery[],
  center: { lat: number; lon: number },
  coordOf: (c: NearbyCemetery) => { lat: number; lon: number } | null,
): { cemeteries: NearbyCemetery[]; osmOnly: OsmOnlyCemetery[] } {
  const byQid = new Map(wikidata.map((c) => [c.qid, c]));
  const merged = new Map<string, NearbyCemetery>(wikidata.map((c) => [c.qid, { ...c }]));
  const osmOnly: OsmOnlyCemetery[] = [];
  const seenOsmNames = new Set<string>();

  for (const o of osm) {
    let match: NearbyCemetery | undefined = o.wikidata ? byQid.get(o.wikidata) : undefined;
    if (!match && o.name) {
      const n = normalizeName(o.name);
      match = wikidata.find((c) => {
        if (normalizeName(c.name) !== n) return false;
        const at = coordOf(c);
        return !at || haversineKm(at, o) <= NAME_MATCH_MAX_KM;
      });
    }
    if (match) {
      const m = merged.get(match.qid)!;
      m.osmId ??= o.osmId;
      continue;
    }
    if (!o.name) continue; // An unnamed polygon is no use to a visitor.
    const key = `${normalizeName(o.name)}@${o.lat.toFixed(2)},${o.lon.toFixed(2)}`;
    if (seenOsmNames.has(key)) continue;
    seenOsmNames.add(key);
    osmOnly.push({
      osmId: o.osmId,
      name: o.name,
      lat: o.lat,
      lon: o.lon,
      distanceKm: Math.round(haversineKm(center, o) * 100) / 100,
    });
  }
  osmOnly.sort((a, b) => a.distanceKm - b.distanceKm);
  return { cemeteries: [...merged.values()], osmOnly };
}
