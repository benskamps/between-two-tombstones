// Uncached orchestration used by both the API routes and the pages: calls the
// cached fetchers, names every failure, and falls back to the committed
// snapshots for the two sample cemeteries.

import type { CemeterySnapshot, Person, WikipediaSummary } from "@/lib/types";
import { cachedBurials, cachedCemeteryFacts, cachedExtracts, cachedNearby, cachedOsm, cachedSearch } from "./cached";
import { asDataSourceError, DataSourceError, type DataSource } from "./errors";
import { mergeOsm, type OsmCemetery } from "./overpass";
import { savedSnapshot } from "./samples";
import type { BurialsResponse, CemeterySearchResult, NearbyCemetery, NearResponse, SourceStatus } from "./types";
import { rankPeople } from "@/lib/tour/score";
import type { MoreStories } from "@/lib/tour/stories";
import { cleanExtract, personName } from "@/lib/tour/text";
import { parsePoint } from "@/lib/types";
import { burialsQuery, NEAR_RADIUS_KM, searchWithFallback, type PersonRow } from "./wikidata";
import { BATCH_SIZE, titleFromUrl } from "./wikipedia";

/** A sample cemetery falls back to its saved copy if live data takes longer than this. */
export const SAMPLE_BUDGET_MS = 12_000;
/** Any other cemetery has no fallback, so it may wait longer. */
export const LIVE_BUDGET_MS = 35_000;
/**
 * The burials query alone: past this the page stops waiting and names a
 * timeout (the browser then retries once, app/cemetery/[qid]). Shorter than
 * the query's own timeout (BURIALS_FETCH), so the classification happens here,
 * outside the cache, and a late answer still fills the cache.
 */
export const BURIALS_BUDGET_MS = 25_000;
/**
 * The tour page shows the first stories once the first batch of 20 is in; the
 * rest follow. If they all land within this long of the first batch (a warm
 * cache), the page sends them in one go instead.
 */
export const FIRST_STORIES_GRACE_MS = 150;
/** After the first stories are on screen, the rest get this long; then the page names what's missing. */
export const MORE_STORIES_BUDGET_MS = 20_000;
/** Longest hold SIMULATE_SLOW_BURIALS can ask for. */
export const MAX_SIMULATED_HOLD_MS = 30_000;
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

/**
 * Test hook, like DISABLE_WIKIDATA: SIMULATE_SLOW_BURIALS=Q216344,Q239043 makes
 * those cemeteries' burials time out at once, so e2e can walk the slow path.
 * `Q1950358:6000` holds that one for 6 s first (at most 30 s), so e2e can read
 * the loading screen. Returns the hold in ms, or null when the QID isn't listed.
 */
function simulatedSlowBurials(qid: string): number | null {
  const list = process.env.SIMULATE_SLOW_BURIALS;
  if (!list) return null;
  for (const entry of list.split(",")) {
    const [id, hold] = entry.trim().split(":");
    if (id !== qid) continue;
    const ms = Number(hold ?? 0);
    return Number.isFinite(ms) && ms > 0 ? Math.min(ms, MAX_SIMULATED_HOLD_MS) : 0;
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

/**
 * English Wikipedia titles in the order the tour will show their people
 * (rankPeople, counting every article as a story to come), so the first
 * batch of 20 holds the first stops and the page can show them before the
 * rest arrive. Without a ranking signal, Wikidata's order (most sitelinks) holds.
 */
export function titlesInTourOrder(rows: PersonRow[], now: Date = new Date()): string[] {
  const titleOf = new Map<string, string>();
  for (const r of rows) {
    const t = r.enwiki ? titleFromUrl(r.enwiki) : null;
    if (t && !titleOf.has(r.person.qid)) titleOf.set(r.person.qid, t);
  }
  const people: Person[] = rows.map((r) => ({ ...r.person, wikipedia: null }));
  const ranked = rankPeople(people, { now, storyPending: new Set(titleOf.keys()) });
  return [...new Set(ranked.flatMap((s) => titleOf.get(s.person.qid) ?? []))];
}

export type CemeteryLoad =
  | { status: "ok"; data: BurialsResponse }
  | { status: "not-found"; qid: string }
  | { status: "error"; error: DataSourceError };

/**
 * What the tour page renders: a whole load, or (on a cold cache) the people
 * with the first batch of stories, who is still waiting for one, and a
 * promise for the rest. `more` never rejects.
 */
export type TourLoad = CemeteryLoad | { status: "partial"; data: BurialsResponse; pending: string[]; more: Promise<MoreStories> };

type Batch = PromiseSettledResult<Record<string, WikipediaSummary>>;

/** Burials and facts are in; the Wikipedia batches are running. */
type Started = {
  cemetery: CemeterySnapshot["cemetery"];
  rows: PersonRow[];
  fetchedAt: string;
  titles: string[];
  batches: string[][];
  /** One per batch, already running, in tour order. Each settles; none rejects. */
  results: Promise<Batch>[];
};

type LiveResult = { data: BurialsResponse; missingStories: number; wikipediaError: DataSourceError | null };

/**
 * Burials queries still running, by QID. When the page gives up at
 * BURIALS_BUDGET_MS, the query carries on for up to 3 s more and then fills the
 * cache; the browser's one retry (SlowCemetery) joins it here instead of
 * starting a second query from scratch.
 */
const burialsInFlight = new Map<string, ReturnType<typeof cachedBurials>>();

function burialsOnce(qid: string): ReturnType<typeof cachedBurials> {
  const running = burialsInFlight.get(qid);
  if (running) return running;
  const query = cachedBurials(qid);
  if (burialsInFlight.size < MAX_IN_FLIGHT) {
    burialsInFlight.set(qid, query);
    const forget = () => {
      if (burialsInFlight.get(qid) === query) burialsInFlight.delete(qid);
    };
    query.then(forget, forget);
  }
  return query;
}

function settle<T>(p: Promise<T>): Promise<PromiseSettledResult<T>> {
  return p.then(
    (value) => ({ status: "fulfilled", value }),
    (reason: unknown) => ({ status: "rejected", reason }),
  );
}

/** Burials, then facts alongside every Wikipedia batch. Null when the item doesn't exist. */
async function startLive(qid: string, stage: { source: DataSource }): Promise<Started | null> {
  stage.source = "Wikidata";
  const hold = simulatedSlowBurials(qid);
  if (hold !== null) {
    if (hold > 0) await sleep(hold);
    throw new DataSourceError("Wikidata", "timeout", `Burials for ${qid} timed out (SIMULATE_SLOW_BURIALS).`);
  }
  const { rows, fetchedAt } = await call("Wikidata", () =>
    withBudget(
      burialsOnce(qid),
      BURIALS_BUDGET_MS,
      () => new DataSourceError("Wikidata", "timeout", `No list of burials from Wikidata within ${BURIALS_BUDGET_MS / 1000} s.`),
    ),
  );
  const titles = titlesInTourOrder(rows);
  const factsP = call("Wikidata", () => cachedCemeteryFacts(qid)).finally(() => {
    stage.source = "Wikipedia";
  });
  // One cached call per 20-title batch: a 429 on the last batch keeps the
  // stories the first batches already brought back (and cached).
  const batches: string[][] = [];
  for (let i = 0; i < titles.length; i += BATCH_SIZE) batches.push(titles.slice(i, i + BATCH_SIZE));
  const results = batches.map((b) => settle(call("Wikipedia", () => cachedExtracts(b))));
  const cemetery = await factsP;
  if (!cemetery) return null;
  return { cemetery, rows, fetchedAt, titles, batches, results };
}

/** The snapshot from the batches that have answered; `undefined` is a batch still on its way (not counted as missing). */
function assembleLive(s: Started, results: (Batch | undefined)[]): LiveResult {
  const summaries: Record<string, WikipediaSummary> = {};
  let missingStories = 0;
  let wikipediaError: DataSourceError | null = null;
  results.forEach((r, i) => {
    if (!r) return;
    if (r.status === "fulfilled") Object.assign(summaries, r.value);
    else {
      missingStories += s.batches[i].length;
      wikipediaError ??= asDataSourceError(r.reason, "Wikipedia");
    }
  });
  const warnings: BurialsResponse["warnings"] = [];
  if (wikipediaError) {
    warnings.push({
      source: "Wikipedia",
      code: "stories-missing",
      message: `Couldn't load ${missingStories} of ${s.titles.length} stories from Wikipedia. Names and dates are all here; try again in a minute for the rest.`,
    });
  }
  return {
    data: { ...assembleSnapshot(s.cemetery, s.rows, summaries, s.fetchedAt), origin: "live", warnings },
    missingStories,
    wikipediaError,
  };
}

/** Every batch's result, or a timeout for the ones still out after `ms`. */
async function batchesWithin(results: Promise<Batch>[], ms: number): Promise<Batch[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<Batch>((resolve) => {
    timer = setTimeout(
      () => resolve({ status: "rejected", reason: new DataSourceError("Wikipedia", "timeout", `No answer from Wikipedia within ${ms / 1000} s.`) }),
      ms,
    );
  });
  try {
    return await Promise.all(results.map((r) => Promise.race([r, late])));
  } finally {
    clearTimeout(timer);
  }
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

/** One cemetery's load, shared by everyone who asks while it runs. */
type Staged = {
  /** Everything (the API, the /near warm-up, share pages, the calendar). */
  full: Promise<CemeteryLoad>;
  /** The tour page's view: the first stories early when the cache is cold. Made on first use. */
  tour: () => Promise<TourLoad>;
};

/**
 * Loads still in flight, by QID. 'use cache' only shares an entry once it's
 * stored, so a tour request that lands while /near's warm-up (or another
 * visitor) is still loading the same cemetery would ask Wikimedia for it all
 * again. It joins the running load instead. Settled loads leave the map, so
 * the next request goes through the cache (and retries a failure) as before.
 */
const inFlight = new Map<string, Staged>();
/** Cap on remembered in-flight loads (and burials queries); past it, loads simply run on their own. */
export const MAX_IN_FLIGHT = 50;

function staged(qid: string): Staged {
  const running = inFlight.get(qid);
  if (running) return running;
  const load = stageCemetery(qid);
  if (inFlight.size < MAX_IN_FLIGHT) {
    inFlight.set(qid, load);
    void load.full.finally(() => {
      if (inFlight.get(qid) === load) inFlight.delete(qid);
    });
  }
  return load;
}

/** Live burials + stories for a cemetery; for the samples, the saved copy when live fails. */
export function loadCemetery(qid: string): Promise<CemeteryLoad> {
  return staged(qid).full;
}

/**
 * The tour page's load. Warm, it's the same as loadCemetery. Cold, it comes
 * back as soon as the first 20 stories (the first stops, in tour order) are
 * in, with a promise for the rest: on a big cemetery that is seconds sooner.
 */
export function loadTour(qid: string): Promise<TourLoad> {
  return staged(qid).tour();
}

function stageCemetery(qid: string): Staged {
  const saved = savedSnapshot(qid);
  const stage: { source: DataSource } = { source: "Wikidata" };
  const budgetMs = saved ? SAMPLE_BUDGET_MS : LIVE_BUDGET_MS;
  const overBudget = () => new DataSourceError(stage.source, "timeout", `No complete answer within ${budgetMs / 1000} s.`);
  const started = startLive(qid, stage);

  const failed = (e: unknown): CemeteryLoad => {
    const err = asDataSourceError(e, stage.source);
    if (saved) return { status: "ok", data: tidyPeople(fromSaved(saved, err)) };
    return { status: "error", error: err };
  };
  const complete = (s: Started, results: Batch[]): BurialsResponse => {
    const live = assembleLive(s, results);
    // A sample whose stories partly failed gets them from its saved copy.
    return tidyPeople(saved && live.missingStories > 0 ? backfillStories(live.data, saved) : live.data);
  };

  const full: Promise<CemeteryLoad> = withBudget(
    started.then(async (s) => (s ? complete(s, await Promise.all(s.results)) : null)),
    budgetMs,
    overBudget,
  ).then((data): CemeteryLoad => (data ? { status: "ok", data } : { status: "not-found", qid }), failed);

  let tour: Promise<TourLoad> | undefined;
  const early = async (): Promise<TourLoad> => {
    const first = await withBudget(
      started.then(async (s) => (s && s.results.length > 1 ? { s, batch: await s.results[0] } : null)),
      budgetMs,
      overBudget,
    ).catch(() => null);
    // Not found, failed, or one batch at most: nothing to show early. A first batch that failed (a 429)
    // waits for the rest, as before, rather than open on 20 stops without stories.
    if (!first || first.batch.status === "rejected") return full;
    // Everything else landed too (a warm cache): one render.
    const done = await Promise.race([full, sleep(FIRST_STORIES_GRACE_MS).then(() => null)]);
    if (done) return done;

    const { s, batch } = first;
    const data = tidyPeople(assembleLive(s, [batch]).data);
    const later = new Set(s.batches.slice(1).flat());
    const waiting = new Set(
      s.rows.flatMap((r) => {
        const t = r.enwiki ? titleFromUrl(r.enwiki) : null;
        return t && later.has(t) ? [r.person.qid] : [];
      }),
    );
    const pending = data.people.filter((p) => !p.wikipedia && waiting.has(p.qid)).map((p) => p.qid);
    const more = batchesWithin(s.results, MORE_STORIES_BUDGET_MS).then(
      (results): MoreStories => {
        const all = complete(s, results);
        const stories: MoreStories["stories"] = {};
        for (const p of all.people) if (p.wikipedia && waiting.has(p.qid)) stories[p.qid] = p.wikipedia;
        return { stories, warnings: all.warnings };
      },
      (): MoreStories => ({
        stories: {},
        warnings: [
          {
            source: "Wikipedia",
            code: "stories-missing",
            message: `Couldn't load ${pending.length} of ${s.titles.length} stories from Wikipedia. Names and dates are all here; try again in a minute for the rest.`,
          },
        ],
      }),
    );
    return { status: "partial", data, pending, more };
  };
  return { full, tour: () => (tour ??= early()) };
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
