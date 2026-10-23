import { beforeEach, describe, expect, it, vi } from "vitest";
import burialsJson from "./__fixtures__/sparql-burials-Q2008469.json";
import factsJson from "./__fixtures__/sparql-facts-Q2008469.json";
import batch from "./__fixtures__/wikipedia-extracts-batch1.json";
import { DataSourceError } from "./errors";
import { flattenBindings, parseBurialRows, parseCemeteryFacts } from "./wikidata";
import { parseExtracts } from "./wikipedia";

const cached = vi.hoisted(() => ({
  cachedBurials: vi.fn(),
  cachedCemeteryFacts: vi.fn(),
  cachedExtracts: vi.fn(),
  cachedNearby: vi.fn(),
  cachedSearch: vi.fn(),
  cachedOsm: vi.fn(),
}));
vi.mock("./cached", () => cached);

const { combineNear, loadCemetery, loadNearOsm, loadSearch, loadTour, normalizeQuery, resetOsmCooldown, tidyPeople, titlesInTourOrder, MORE_STORIES_BUDGET_MS } =
  await import("./load");
const { rankPeople } = await import("@/lib/tour/score");

const rows = parseBurialRows(flattenBindings(burialsJson));
const facts = parseCemeteryFacts("Q2008469", flattenBindings(factsJson));
const extracts = parseExtracts(batch.titles, batch.response);
const wikidataDown = () => new DataSourceError("Wikidata", "unreachable", "query.wikidata.org: fetch failed (ECONNRESET)");
/** Recorded summaries where we have them, a stand-in for the rest. */
const summariesFor = async (titles: string[]) =>
  Object.fromEntries(titles.map((t) => [t, extracts[t] ?? { title: t, extract: `${t} lived.`, url: `https://en.wikipedia.org/wiki/${t}` }]));
const rateLimited = () => new DataSourceError("Wikipedia", "rate-limited", "en.wikipedia.org asked us to wait 46 s.", { status: 429, retryAfterSeconds: 46 });

beforeEach(() => {
  for (const fn of Object.values(cached)) fn.mockReset();
  resetOsmCooldown();
});

describe("loadCemetery", () => {
  it("assembles a live snapshot: facts, people and their Wikipedia summaries", async () => {
    cached.cachedBurials.mockResolvedValue({ rows, fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue(facts);
    cached.cachedExtracts.mockImplementation(summariesFor);
    const r = await loadCemetery("Q2008469");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.origin).toBe("live");
    expect(r.data.warnings).toEqual([]);
    expect(r.data.cemetery.name).toBe("Oakland Cemetery");
    // All 80 recorded rows: the 2 whose label is their QID are named from their articles (F20).
    expect(r.data.people).toHaveLength(80);
    expect(r.data.people.find((p) => p.name === "Margaret Mitchell")?.wikipedia?.extract).toMatch(/^Margaret Munnerlyn Mitchell/);
    expect(r.data.sources.wikipedia.license).toBe("CC BY-SA 4.0");
    // One cached call per batch of at most 20 titles.
    const batchSizes = cached.cachedExtracts.mock.calls.map(([titles]) => (titles as string[]).length);
    expect(batchSizes.every((n) => n <= 20)).toBe(true);
    expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(r.data.people.filter((p) => p.wikipedia).length);
  });

  it("falls back to the saved snapshot for a sample cemetery and says when it was saved", async () => {
    cached.cachedBurials.mockRejectedValue(wikidataDown());
    const r = await loadCemetery("Q2008469");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.origin).toBe("saved");
    expect(r.data.people.length).toBeGreaterThanOrEqual(50);
    expect(r.data.warnings[0]).toEqual({
      source: "Wikidata",
      code: "saved-copy",
      message: "Couldn't reach Wikidata, so this is the copy saved on Oct 21, 2026.",
    });
  });

  it("says Wikidata was slow, not unreachable, when the saved copy stands in for a timeout", async () => {
    cached.cachedBurials.mockRejectedValue(new DataSourceError("Wikidata", "timeout", "No list of burials from Wikidata within 25 s."));
    const r = await loadCemetery("Q2008469");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.origin).toBe("saved");
    expect(r.data.warnings[0].message).toBe("Wikidata was slow to answer, so this is the copy saved on Oct 21, 2026.");
  });

  it("recovers the source from an error that crossed the cache boundary as a plain Error", async () => {
    cached.cachedBurials.mockRejectedValue(new Error(new DataSourceError("Wikidata", "rate-limited", "busy", { status: 429 }).message));
    const r = await loadCemetery("Q872253");
    expect(r).toMatchObject({ status: "error", error: { source: "Wikidata", kind: "rate-limited" } });
  });

  it("names the failure for any other cemetery", async () => {
    cached.cachedBurials.mockRejectedValue(wikidataDown());
    const r = await loadCemetery("Q872253");
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.error.toBody()).toEqual({ error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute, or open a saved tour." } });
    expect(r.error.httpStatus).toBe(503);
  });

  it("keeps names and dates when only Wikipedia fails, with a named warning", async () => {
    cached.cachedBurials.mockResolvedValue({ rows, fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue({ ...facts!, qid: "Q872253" });
    cached.cachedExtracts.mockRejectedValue(rateLimited());
    const r = await loadCemetery("Q872253");
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.origin).toBe("live");
    // All 80 recorded rows: the 2 whose label is their QID are named from their articles (F20).
    expect(r.data.people).toHaveLength(80);
    expect(r.data.people.every((p) => p.wikipedia === null)).toBe(true);
    expect(r.data.warnings[0]).toMatchObject({ source: "Wikipedia", code: "stories-missing", message: expect.stringMatching(/^Couldn't load \d+ of \d+ stories from Wikipedia/) });
  });

  it("keeps the batches that worked when a later batch is rate-limited", async () => {
    cached.cachedBurials.mockResolvedValue({ rows, fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue({ ...facts!, qid: "Q872253" });
    let call = 0;
    cached.cachedExtracts.mockImplementation(async (titles: string[]) => {
      call++;
      if (call >= 4) throw rateLimited();
      return summariesFor(titles);
    });
    const r = await loadCemetery("Q872253");
    if (r.status !== "ok") throw new Error("expected ok");
    const withStory = r.data.people.filter((p) => p.wikipedia).length;
    expect(withStory).toBe(60);
    expect(r.data.people[0].wikipedia).not.toBeNull(); // most famous first, so batch 1 has them
    expect(r.data.warnings[0].message).toMatch(/^Couldn't load \d+ of \d+ stories/);
  });

  it("backfills a sample's missing stories from its saved copy and says so", async () => {
    cached.cachedBurials.mockResolvedValue({ rows, fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue(facts);
    let call = 0;
    cached.cachedExtracts.mockImplementation(async (titles: string[]) => {
      call++;
      if (call >= 2) throw rateLimited();
      return summariesFor(titles);
    });
    const r = await loadCemetery("Q2008469");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.data.origin).toBe("live");
    // Everyone in both the live list and the saved copy has a story.
    expect(r.data.people.filter((p) => !p.wikipedia).length).toBeLessThanOrEqual(5);
    expect(r.data.warnings[0].code).toBe("stories-backfilled");
    expect(r.data.warnings[0].message).toMatch(/^Wikipedia didn't answer for every story, so \d+ come from the copy saved on Oct 21, 2026\.$/);
  });

  it("repairs or drops QID-named people and cleans story text in a cache entry written before the parse-time fixes", async () => {
    const stale = [
      ...rows,
      // Written by the old parser: a bare QID as the name. One has an article, one doesn't.
      { person: { ...rows[1].person, qid: "Q16162799", name: "Q16162799" }, enwiki: null },
      { person: { ...rows[2].person, qid: "Q16162800", name: "Q16162800" }, enwiki: "https://en.wikipedia.org/wiki/Jane_Doe_(diarist)" },
    ];
    cached.cachedBurials.mockResolvedValue({ rows: stale, fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue({ ...facts!, qid: "Q872253" });
    const gordon = rows.find((r) => r.person.name === "John B. Gordon")!;
    const title = gordon.enwiki!.split("/wiki/")[1].replaceAll("_", " ");
    cached.cachedExtracts.mockImplementation(async (titles: string[]) => ({
      ...(await summariesFor(titles)),
      ...(titles.includes(title)
        ? { [title]: { title, extract: "John Brown Gordon ((1832-02-06)February 6, 1832 – (1904-01-09)January 9, 1904) was a general.", url: gordon.enwiki! } }
        : {}),
    }));
    const r = await loadCemetery("Q872253");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.data.people.some((p) => p.qid === "Q16162799")).toBe(false);
    expect(r.data.people.find((p) => p.qid === "Q16162800")?.name).toBe("Jane Doe");
    expect(r.data.people.filter((p) => /^Q\d+$/.test(p.name))).toEqual([]);
    expect(r.data.people.find((p) => p.name === "John B. Gordon")?.wikipedia?.extract).toBe(
      "John Brown Gordon (February 6, 1832 – January 9, 1904) was a general.",
    );
  });

  it("the saved Oakland copy comes back with real names and clean stories", async () => {
    cached.cachedBurials.mockRejectedValue(wikidataDown());
    const r = await loadCemetery("Q2008469");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.data.origin).toBe("saved");
    // The committed snapshot names two people by their QID; both have articles, so both come back named.
    expect(r.data.people).toHaveLength(80);
    expect(r.data.people.filter((p) => /^Q\d+$/.test(p.name))).toEqual([]);
    expect(r.data.people.find((p) => p.qid === "Q6986296")?.name).toBe("Nedom L. Angier");
    expect(r.data.people.find((p) => p.qid === "Q6066179")?.name).toBe("Ira O. McDaniel");
    expect(r.data.people.find((p) => p.name === "John B. Gordon")?.wikipedia?.extract).toMatch(/^John Brown Gordon \(February 6, 1832 – /);
    expect(r.data.people.find((p) => p.name === "Charles Collier")?.wikipedia?.extract).toMatch(/^Charles Augustus Collier \(July 19, 1848 – /);
  });

  it("tidyPeople drops a bare-QID person whose story didn't load (no title to name them by)", () => {
    const p = { ...rows[0].person, qid: "Q1", name: "Q1", wikipedia: null };
    const named = { ...rows[1].person, wikipedia: null };
    expect(tidyPeople({ people: [p, named] }).people).toEqual([named]);
  });

  it("a request that lands while the same cemetery is loading joins that load (one set of Wikimedia calls)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    cached.cachedBurials.mockImplementation(async () => {
      await gate;
      return { rows, fetchedAt: "2026-10-20T02:15:00.000Z" };
    });
    cached.cachedCemeteryFacts.mockResolvedValue({ ...facts!, qid: "Q872253" });
    cached.cachedExtracts.mockImplementation(summariesFor);
    const warmUp = loadCemetery("Q872253");
    const tour = loadCemetery("Q872253");
    release();
    const [a, b] = await Promise.all([warmUp, tour]);
    expect(a).toBe(b);
    expect(cached.cachedBurials).toHaveBeenCalledTimes(1);
    // Once settled, the next request goes through the cache again (a failure is retried, never pinned).
    await loadCemetery("Q872253");
    expect(cached.cachedBurials).toHaveBeenCalledTimes(2);
  });

  it("stops waiting for a big cemetery's burials at 25 s and names a timeout, outside the cache (N1)", async () => {
    vi.useFakeTimers();
    try {
      cached.cachedBurials.mockReturnValue(new Promise(() => {})); // Wikidata never answers
      const pending = loadCemetery("Q216344");
      await vi.advanceTimersByTimeAsync(24_999);
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const r = await pending;
      expect(r).toMatchObject({ status: "error", error: { source: "Wikidata", kind: "timeout" } });
      if (r.status === "error") expect(r.error.userMessage).toBe("Wikidata took too long to answer. Try again in a minute, or open a saved tour.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("SIMULATE_SLOW_BURIALS makes the listed cemeteries time out at once (e2e hook)", async () => {
    vi.stubEnv("SIMULATE_SLOW_BURIALS", "Q216344, Q239043");
    try {
      expect(await loadCemetery("Q239043")).toMatchObject({ status: "error", error: { source: "Wikidata", kind: "timeout" } });
      expect(cached.cachedBurials).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports not-found when Wikidata has no such item", async () => {
    cached.cachedBurials.mockResolvedValue({ rows: [], fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue(null);
    expect(await loadCemetery("Q999999999")).toEqual({ status: "not-found", qid: "Q999999999" });
  });
});

describe("loadTour: the first stories before the rest (review pass 4, item 1)", () => {
  const live = () => {
    cached.cachedBurials.mockResolvedValue({ rows, fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue({ ...facts!, qid: "Q872253" });
  };
  /** Batch 1 answers at once; the others wait for release(). */
  const holdLaterBatches = () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let call = 0;
    cached.cachedExtracts.mockImplementation(async (titles: string[]) => {
      if (++call > 1) await gate;
      return summariesFor(titles);
    });
    return () => release();
  };

  it("asks Wikipedia for the stories in tour order, so the first batch holds the first stops", async () => {
    live();
    cached.cachedExtracts.mockImplementation(summariesFor);
    const r = await loadCemetery("Q872253");
    if (r.status !== "ok") throw new Error("expected ok");
    const firstBatch = new Set(cached.cachedExtracts.mock.calls[0][0] as string[]);
    expect(firstBatch.size).toBe(20);
    const stops = rankPeople(r.data.people, { cemeteryName: r.data.cemetery.name }).slice(0, 12);
    for (const s of stops) expect(firstBatch, s.person.name).toContain(s.person.wikipedia!.title);
    // Every title is asked for once.
    const all = cached.cachedExtracts.mock.calls.flatMap(([t]) => t as string[]);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(titlesInTourOrder(rows));
  });

  it("cold: comes back with the first 20 stories and who is still waiting, then the rest arrive", async () => {
    live();
    const release = holdLaterBatches();
    const tour = await loadTour("Q872253");
    if (tour.status !== "partial") throw new Error(`expected partial, got ${tour.status}`);
    expect(tour.data.people).toHaveLength(80);
    expect(tour.data.warnings).toEqual([]);
    const withStory = tour.data.people.filter((p) => p.wikipedia);
    expect(withStory.length).toBeGreaterThan(0);
    expect(withStory.length).toBeLessThanOrEqual(20);
    // Nobody is both: the waiting list is exactly the people whose batch is still out.
    expect(tour.pending.length).toBeGreaterThan(40);
    for (const q of tour.pending) expect(tour.data.people.find((p) => p.qid === q)?.wikipedia).toBeNull();

    release();
    const more = await tour.more;
    expect(Object.keys(more.stories).sort()).toEqual([...tour.pending].sort());
    expect(more.warnings).toEqual([]);
    // The API's whole load is the same tour, all at once.
    const full = await loadCemetery("Q872253");
    if (full.status !== "ok") throw new Error("expected ok");
    expect(full.data.people.filter((p) => p.wikipedia)).toHaveLength(withStory.length + tour.pending.length);
  });

  it("warm: everything is in at once, so it's one ordinary load", async () => {
    live();
    cached.cachedExtracts.mockImplementation(summariesFor);
    const tour = await loadTour("Q872253");
    expect(tour.status).toBe("ok");
  });

  it("a first batch that fails waits for the rest, as before, and names what's missing", async () => {
    live();
    let call = 0;
    cached.cachedExtracts.mockImplementation(async (titles: string[]) => {
      if (++call === 1) throw rateLimited();
      return summariesFor(titles);
    });
    const tour = await loadTour("Q872253");
    if (tour.status !== "ok") throw new Error(`expected ok, got ${tour.status}`);
    expect(tour.data.warnings[0]).toMatchObject({ code: "stories-missing", message: expect.stringMatching(/^Couldn't load 20 of \d+ stories/) });
  });

  it("stories that never come are named after MORE_STORIES_BUDGET_MS, and the page keeps the ones it has", async () => {
    vi.useFakeTimers();
    try {
      live();
      let call = 0;
      cached.cachedExtracts.mockImplementation(async (titles: string[]) => {
        if (++call === 4) return new Promise(() => {}); // the last batch never answers
        return summariesFor(titles);
      });
      // Its own QID: this load's full budget never runs out once the fake clock is gone, so it stays in flight.
      const tourP = loadTour("Q5189371");
      await vi.advanceTimersByTimeAsync(1_000);
      const tour = await tourP;
      if (tour.status !== "partial") throw new Error(`expected partial, got ${tour.status}`);
      let done = false;
      void tour.more.then(() => (done = true));
      // The first stories went out about FIRST_STORIES_GRACE_MS (150 ms) in; the rest get 20 s from then.
      await vi.advanceTimersByTimeAsync(MORE_STORIES_BUDGET_MS - 1_000);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      const more = await tour.more;
      expect(more.warnings[0]).toMatchObject({ code: "stories-missing", message: expect.stringMatching(/^Couldn't load \d+ of \d+ stories from Wikipedia/) });
      expect(Object.keys(more.stories).length).toBeGreaterThan(30); // batches 2 and 3
      expect(Object.keys(more.stories).length).toBeLessThan(tour.pending.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a sample whose later stories fail gets them from its saved copy, and says so", async () => {
    cached.cachedBurials.mockResolvedValue({ rows, fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue(facts);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let call = 0;
    cached.cachedExtracts.mockImplementation(async (titles: string[]) => {
      if (++call === 1) return summariesFor(titles);
      await gate;
      throw rateLimited();
    });
    const tour = await loadTour("Q2008469");
    if (tour.status !== "partial") throw new Error(`expected partial, got ${tour.status}`);
    expect(tour.data.origin).toBe("live");
    release();
    const more = await tour.more;
    expect(Object.keys(more.stories).length).toBeGreaterThan(tour.pending.length - 5);
    expect(more.warnings[0]).toMatchObject({ code: "stories-backfilled" });
  });
});

describe("the slow path (N1)", () => {
  it("the browser's retry after the 25 s budget joins the burials query still running, instead of starting another", async () => {
    vi.useFakeTimers();
    try {
      let answer!: () => void;
      const late = new Promise<void>((r) => (answer = r));
      cached.cachedBurials.mockImplementation(async () => {
        await late;
        return { rows, fetchedAt: "2026-10-20T02:15:00.000Z" };
      });
      cached.cachedCemeteryFacts.mockResolvedValue({ ...facts!, qid: "Q1950358" });
      cached.cachedExtracts.mockImplementation(summariesFor);
      const page = loadCemetery("Q1950358");
      await vi.advanceTimersByTimeAsync(25_000);
      expect(await page).toMatchObject({ status: "error", error: { kind: "timeout" } });
      const retry = loadCemetery("Q1950358");
      await vi.advanceTimersByTimeAsync(2_000);
      answer(); // Wikidata answers 27 s in
      await vi.advanceTimersByTimeAsync(0);
      expect((await retry).status).toBe("ok");
      expect(cached.cachedBurials).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("SIMULATE_SLOW_BURIALS can hold a cemetery first (Q:ms, at most 30 s), so e2e can read the loading screen", async () => {
    vi.stubEnv("SIMULATE_SLOW_BURIALS", "Q216344, Q1950358:6000, Q239043:999999");
    vi.useFakeTimers();
    try {
      const held = loadCemetery("Q1950358");
      let settled = false;
      void held.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(5_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await held).toMatchObject({ status: "error", error: { source: "Wikidata", kind: "timeout" } });
      const capped = loadCemetery("Q239043");
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await capped).toMatchObject({ status: "error", error: { kind: "timeout" } });
      expect(cached.cachedBurials).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });
});

describe("near", () => {
  it("names an OpenStreetMap outage, then skips OSM during the cooldown", async () => {
    cached.cachedOsm.mockRejectedValue(new DataSourceError("OpenStreetMap", "unreachable", "All 3 Overpass mirrors failed: overpass-api.de (unreachable)."));
    const first = await loadNearOsm(47.6339, -122.3158);
    // The page gets a plain sentence; mirror host names and status codes stay in the server log.
    expect(first).toEqual({ ok: false, message: "Couldn't reach OpenStreetMap. Showing Wikidata results only." });
    const second = await loadNearOsm(47.6339, -122.3158);
    expect(second.ok).toBe(false);
    expect(second).toMatchObject({ message: "Couldn't reach OpenStreetMap a few minutes ago, so it was skipped. Showing Wikidata results only." });
    expect(cached.cachedOsm).toHaveBeenCalledTimes(1);

    const combined = combineNear({ lat: 47.634, lon: -122.316 }, [], first);
    expect(combined.sources).toEqual([
      { source: "Wikidata", ok: true },
      { source: "OpenStreetMap", ok: false, message: expect.stringContaining("Couldn't reach OpenStreetMap") },
    ]);
  });

  it("normalizes search text for the cache key", () => {
    expect(normalizeQuery("  Lake   View Cemetery ")).toBe("lake view cemetery");
  });
});

describe("search", () => {
  const result = (qid: string, burials: number) => ({
    qid,
    name: `Cemetery ${qid}`,
    description: null,
    locatedIn: null,
    region: null,
    coord: null,
    findAGraveCemeteryId: null,
    enwiki: null,
    burials,
  });

  it("caches each query on its own and widens a short one with \"<q> cemetery\" (2 cached calls at most)", async () => {
    cached.cachedSearch.mockImplementation(async (q: string) => (q === "oakland" ? [result("Q1", 40), result("Q2008469", 115)] : [result("Q2008469", 115), result("Q3", 110)]));
    const results = await loadSearch("  Oakland ");
    expect(cached.cachedSearch.mock.calls.map(([q]) => q)).toEqual(["oakland", "oakland cemetery"]);
    expect(results.map((r) => r.qid)).toEqual(["Q2008469", "Q3", "Q1"]);
  });

  it("names a Wikidata failure on the first query", async () => {
    cached.cachedSearch.mockRejectedValue(wikidataDown());
    await expect(loadSearch("oakland")).rejects.toMatchObject({ source: "Wikidata", kind: "unreachable" });
    expect(cached.cachedSearch).toHaveBeenCalledTimes(1);
  });
});
