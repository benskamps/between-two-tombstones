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

const { combineNear, loadCemetery, loadNearOsm, normalizeQuery, resetOsmCooldown } = await import("./load");

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
    // 80 recorded rows minus the 2 whose only label is their QID (F20).
    expect(r.data.people).toHaveLength(78);
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
      message: "Couldn't reach Wikidata, so this is the copy saved on Oct 20, 2026.",
    });
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
    // 80 recorded rows minus the 2 whose only label is their QID (F20).
    expect(r.data.people).toHaveLength(78);
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
    expect(r.data.warnings[0].message).toMatch(/^Wikipedia didn't answer for every story, so \d+ come from the copy saved on Oct 20, 2026\.$/);
  });

  it("drops QID-named people and cleans story text from a cache entry written before the parse-time fixes", async () => {
    const stale = [
      ...rows,
      { person: { ...rows[1].person, qid: "Q16162799", name: "Q16162799" }, enwiki: null },
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
    expect(r.data.people.find((p) => p.name === "John B. Gordon")?.wikipedia?.extract).toBe(
      "John Brown Gordon (February 6, 1832 – January 9, 1904) was a general.",
    );
  });

  it("the saved Oakland copy comes back with real names and clean stories", async () => {
    cached.cachedBurials.mockRejectedValue(wikidataDown());
    const r = await loadCemetery("Q2008469");
    if (r.status !== "ok") throw new Error("expected ok");
    expect(r.data.origin).toBe("saved");
    // The committed snapshot has two QID-only names (Q6986296, Q6066179); neither reaches the tour.
    expect(r.data.people.filter((p) => /^Q\d+$/.test(p.name))).toEqual([]);
    expect(r.data.people.find((p) => p.name === "John B. Gordon")?.wikipedia?.extract).toMatch(/^John Brown Gordon \(February 6, 1832 – /);
    expect(r.data.people.find((p) => p.name === "Charles Collier")?.wikipedia?.extract).toMatch(/^Charles Augustus Collier \(July 19, 1848 – /);
  });

  it("reports not-found when Wikidata has no such item", async () => {
    cached.cachedBurials.mockResolvedValue({ rows: [], fetchedAt: "2026-10-20T02:15:00.000Z" });
    cached.cachedCemeteryFacts.mockResolvedValue(null);
    expect(await loadCemetery("Q999999999")).toEqual({ status: "not-found", qid: "Q999999999" });
  });
});

describe("near", () => {
  it("names an OpenStreetMap outage, then skips OSM during the cooldown", async () => {
    cached.cachedOsm.mockRejectedValue(new DataSourceError("OpenStreetMap", "unreachable", "All 3 Overpass mirrors failed: overpass-api.de (unreachable)."));
    const first = await loadNearOsm(47.6339, -122.3158);
    expect(first).toEqual({ ok: false, message: expect.stringContaining("All 3 Overpass mirrors failed") });
    const second = await loadNearOsm(47.6339, -122.3158);
    expect(second.ok).toBe(false);
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
