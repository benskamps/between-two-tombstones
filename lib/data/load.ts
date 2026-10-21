// Uncached orchestration used by both the API routes and the pages: calls the
// cached fetchers, names every failure, and falls back to the committed
// snapshots for the two sample cemeteries.

import type { CemeterySnapshot, Person, WikipediaSummary } from "@/lib/types";
import { cachedBurials, cachedCemeteryFacts, cachedExtracts, cachedNearby, cachedOsm, cachedSearch } from "./cached";
import { asDataSourceError, DataSourceError, type DataSource } from "./errors";
import { mergeOsm, type OsmCemetery } from "./overpass";
import { savedSnapshot } from "./samples";
import type { BurialsResponse, CemeterySearchResult, NearbyCemetery, NearResponse, SourceStatus } from "./types";
import { cleanExtract, personName } from "@/lib/tour/text";
import { parsePoint } from "@/lib/types";
import { burialsQuery, NEAR_RADIUS_KM, searchWithFallback, type PersonRow } from "./wikidata";
import { BATCH_SIZE, titleFromUrl } from "./wikipedia";

/** A sample cemetery falls back to its saved copy if live data takes longer than this. */
export const SAMPLE_BUDGET_MS = 12_000;
/** Any other cemetery has no fallback, so it may wait longer. */
export const LIVE_BUDGET_MS = 35_000;
/** The near API waits this long for OpenStreetMap after Wikidata answers. */
export const OSM_EXTRA_WAIT_MS = 4_000;
/** After every Overpass mirror fails, skip OpenStreetMap for this long. */
export const OSM_COOLDOWN_MS = 10 * 60_000;

async function call<T>(source: DataSource, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw asDataSourceError(err, source);
  }
}

function withBudget<T>(work: Promise<T>, ms: number, onTimeout: () => DataSourceError): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export function formatSavedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an earlier visit";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function assembleSnapshot(
  cemetery: CemeterySnapshot["cemetery"],
  rows: PersonRow[],
  extracts: Record<string, WikipediaSummary>,
  fetchedAt: string,
): CemeterySnapshot {
  // Rows cached before the F20 fix can still carry a bare QID as the name: repair it from the article title, or drop the row.
  const people: Person[] = rows.flatMap(({ person, enwiki }) => {
    const title = enwiki ? titleFromUrl(enwiki) : null;
    const name = personName(person.name, title);
    return name ? [{ ...person, name, wikipedia: title ? extracts[title] ?? null : null }] : [];
  });
  return {
    cemetery,
    fetchedAt,
    sources: {
      wikidata: { license: "CC0 1.0", query: burialsQuery(cemetery.qid).trim() },
      wikipedia: { license: "CC BY-SA 4.0", note: "Intro extracts from the MediaWiki Action API; attribute on every card." },
    },
    people,
  };
}

export type CemeteryLoad =
  | { status: "ok"; data: BurialsResponse }
  | { status: "not-found"; qid: string }
  | { status: "error"; error: DataSourceError };

type LiveResult = { data: BurialsResponse; missingStories: number; wikipediaError: DataSourceError | null };

async function loadLive(qid: string, stage: { source: DataSource }): Promise<LiveResult | null> {
  stage.source = "Wikidata";
  const { rows, fetchedAt } = await call("Wikidata", () => cachedBurials(qid));
  const titles = [
    ...new Set(
      rows.flatMap((r) => {
        const t = r.enwiki ? titleFromUrl(r.enwiki) : null;
        return t ? [t] : [];
      }),
    ),
  ];
  const factsP = call("Wikidata", () => cachedCemeteryFacts(qid)).finally(() => {
    stage.source = "Wikipedia";
  });
  // One cached call per 20-title batch: a 429 on the last batch keeps the
  // stories the first batches already brought back (and cached).
  const batches: string[][] = [];
  for (let i = 0; i < titles.length; i += BATCH_SIZE) batches.push(titles.slice(i, i + BATCH_SIZE));
  const [facts, ...extracts] = await Promise.allSettled([factsP, ...batches.map((b) => call("Wikipedia", () => cachedExtracts(b)))]);
  if (facts.status === "rejected") throw facts.reason;
  const cemetery = facts.value as CemeterySnapshot["cemetery"] | null;
  if (!cemetery) return null;

  const summaries: Record<string, WikipediaSummary> = {};
  let missingStories = 0;
  let wikipediaError: DataSourceError | null = null;
  extracts.forEach((r, i) => {
    if (r.status === "fulfilled") Object.assign(summaries, r.value);
    else {
      missingStories += batches[i].length;
      wikipediaError ??= asDataSourceError(r.reason, "Wikipedia");
    }
  });
  const warnings: BurialsResponse["warnings"] = [];
  if (wikipediaError) {
    warnings.push({
      source: "Wikipedia",
      code: "stories-missing",
      message: `Couldn't load ${missingStories} of ${titles.length} stories from Wikipedia. Names and dates are all here; try again in a minute for the rest.`,
    });
  }
  return {
    data: { ...assembleSnapshot(cemetery, rows, summaries, fetchedAt), origin: "live", warnings },
    missingStories,
    wikipediaError,
  };
}

/** Fill stories Wikipedia didn't send from the saved copy (same person QID). */
export function backfillStories(live: BurialsResponse, saved: CemeterySnapshot): BurialsResponse {
  const savedStories = new Map(saved.people.filter((p) => p.wikipedia).map((p) => [p.qid, p.wikipedia]));
  let filled = 0;
  const people = live.people.map((p) => {
    if (p.wikipedia || !savedStories.has(p.qid)) return p;
    filled++;
    return { ...p, wikipedia: savedStories.get(p.qid)! };
  });
  if (filled === 0) return live;
  return {
    ...live,
    people,
    warnings: [
      {
        source: "Wikipedia",
        code: "stories-backfilled",
        message: `Wikipedia didn't answer for every story, so ${filled} come from the copy saved on ${formatSavedDate(saved.fetchedAt)}.`,
      },
    ],
  };
}

function fromSaved(saved: CemeterySnapshot, err: DataSourceError): BurialsResponse {
  return {
    ...saved,
    origin: "saved",
    warnings: [
      {
        source: err.source,
        code: "saved-copy",
        message: `Couldn't reach ${err.source}, so this is the copy saved on ${formatSavedDate(saved.fetchedAt)}.`,
      },
    ],
  };
}

/**
 * Every person a tour gets has a real name and clean story text, whichever
 * cache entry or saved copy the data came from: parsing fixes new data, but
 * cached rows live up to 7 days and the saved copies are fixed. A bare-QID
 * name takes the English Wikipedia title (F20); with no article, the person
 * is dropped.
 */
export function tidyPeople<T extends { people: Person[] }>(data: T): T {
  let changed = false;
  const people = data.people.flatMap((p) => {
    const name = personName(p.name, p.wikipedia?.title);
    if (!name) {
      changed = true;
      return [];
    }
    const extract = p.wikipedia ? cleanExtract(p.wikipedia.extract) : null;
    if (name === p.name && (!p.wikipedia || extract === p.wikipedia.extract)) return [p];
    changed = true;
    return [{ ...p, name, wikipedia: p.wikipedia && { ...p.wikipedia, extract: extract! } }];
  });
  return changed ? { ...data, people } : data;
}

/**
 * Loads still in flight, by QID. 'use cache' only shares an entry once it's
 * stored, so a tour request that lands while /near's warm-up (or another
 * visitor) is still loading the same cemetery would ask Wikimedia for it all
 * again. It joins the running load instead. Settled loads leave the map, so
 * the next request goes through the cache (and retries a failure) as before.
 */
const inFlight = new Map<string, Promise<CemeteryLoad>>();
/** Cap on remembered in-flight loads; past it, loads simply run on their own. */
export const MAX_IN_FLIGHT = 50;

/** Live burials + stories for a cemetery; for the samples, the saved copy when live fails. */
export function loadCemetery(qid: string): Promise<CemeteryLoad> {
  const running = inFlight.get(qid);
  if (running) return running;
  const load = loadCemeteryOnce(qid).finally(() => {
    if (inFlight.get(qid) === load) inFlight.delete(qid);
  });
  if (inFlight.size < MAX_IN_FLIGHT) inFlight.set(qid, load);
  return load;
}

async function loadCemeteryOnce(qid: string): Promise<CemeteryLoad> {
  const saved = savedSnapshot(qid);
  const stage: { source: DataSource } = { source: "Wikidata" };
  const budgetMs = saved ? SAMPLE_BUDGET_MS : LIVE_BUDGET_MS;
  try {
    const live = await withBudget(
      loadLive(qid, stage),
      budgetMs,
      () => new DataSourceError(stage.source, "timeout", `No complete answer within ${budgetMs / 1000} s.`),
    );
    if (!live) return { status: "not-found", qid };
    // A sample whose stories partly failed gets them from its saved copy.
    if (saved && live.missingStories > 0) return { status: "ok", data: tidyPeople(backfillStories(live.data, saved)) };
    return { status: "ok", data: tidyPeople(live.data) };
  } catch (e) {
    const err = asDataSourceError(e, stage.source);
    if (saved) return { status: "ok", data: tidyPeople(fromSaved(saved, err)) };
    return { status: "error", error: err };
  }
}

// ---------------------------------------------------------------- near

export const roundCoord = (x: number) => Math.round(x * 1000) / 1000;

/** Wikidata cemeteries within 10 km. Throws a DataSourceError naming Wikidata. */
export async function loadNearWikidata(lat: number, lon: number): Promise<NearbyCemetery[]> {
  return call("Wikidata", () => cachedNearby(roundCoord(lat), roundCoord(lon)));
}

export type OsmLoad = { ok: true; mirror: string; cemeteries: OsmCemetery[] } | { ok: false; message: string };

let osmDownUntil = 0;
let osmLastFailure = "";

/** OpenStreetMap cemeteries. Never throws: a failure comes back named. */
export async function loadNearOsm(lat: number, lon: number): Promise<OsmLoad> {
  const now = Date.now();
  if (now < osmDownUntil) {
    return {
      ok: false,
      message: `Couldn't reach OpenStreetMap a few minutes ago (${osmLastFailure.replace(/\.$/, "")}), so it was skipped. Showing Wikidata results only.`,
    };
  }
  try {
    const r = await call("OpenStreetMap", () => cachedOsm(roundCoord(lat), roundCoord(lon), NEAR_RADIUS_KM));
    return { ok: true, mirror: r.mirror, cemeteries: r.cemeteries };
  } catch (e) {
    const err = asDataSourceError(e, "OpenStreetMap");
    osmDownUntil = Date.now() + OSM_COOLDOWN_MS;
    osmLastFailure = err.detail;
    return { ok: false, message: `Couldn't reach OpenStreetMap: ${err.detail} Showing Wikidata results only.` };
  }
}

/** Test hook: forget an OpenStreetMap outage. */
export function resetOsmCooldown() {
  osmDownUntil = 0;
  osmLastFailure = "";
}

const coordOf = (c: NearbyCemetery) => parsePoint(c.coord);

export function combineNear(
  center: { lat: number; lon: number },
  wikidata: NearbyCemetery[],
  osm: OsmLoad,
): NearResponse {
  const sources: SourceStatus[] = [{ source: "Wikidata", ok: true }];
  if (!osm.ok) {
    sources.push({ source: "OpenStreetMap", ok: false, message: osm.message });
    return { center, radiusKm: NEAR_RADIUS_KM, cemeteries: wikidata, osmOnly: [], sources };
  }
  sources.push({ source: "OpenStreetMap", ok: true });
  const merged = mergeOsm(wikidata, osm.cemeteries, center, coordOf);
  return { center, radiusKm: NEAR_RADIUS_KM, cemeteries: merged.cemeteries, osmOnly: merged.osmOnly, sources };
}

/** Wait at most `ms` for an OpenStreetMap answer; the lookup itself carries on (and its outcome is remembered). */
export async function osmWithin(osm: Promise<OsmLoad>, ms: number = OSM_EXTRA_WAIT_MS): Promise<OsmLoad> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<OsmLoad>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, message: `OpenStreetMap didn't answer within ${Math.round(ms / 1000)} s. Showing Wikidata results only.` }),
      ms,
    );
  });
  return Promise.race([osm, late]).finally(() => clearTimeout(timer));
}

/** Wikidata first; OpenStreetMap gets a short extra wait and never blocks the answer. */
export async function loadNear(lat: number, lon: number): Promise<NearResponse> {
  const osmP = loadNearOsm(lat, lon);
  const wikidata = await loadNearWikidata(lat, lon);
  const osm = await osmWithin(osmP);
  return combineNear({ lat: roundCoord(lat), lon: roundCoord(lon) }, wikidata, osm);
}

// ---------------------------------------------------------------- search

export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Cemetery search: each query cached on its own, widened with "<q> cemetery" when it finds few (at most 2 queries). */
export async function loadSearch(q: string): Promise<CemeterySearchResult[]> {
  return call("Wikidata", () => searchWithFallback(normalizeQuery(q), (query) => cachedSearch(query)));
}
