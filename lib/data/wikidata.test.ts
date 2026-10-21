import { afterEach, describe, expect, it, vi } from "vitest";
import burialsJson from "./__fixtures__/sparql-burials-Q2008469.json";
import factsJson from "./__fixtures__/sparql-facts-Q2008469.json";
import nearLakeViewJson from "./__fixtures__/sparql-near-lakeview.json";
import nearManhattanJson from "./__fixtures__/sparql-near-manhattan.json";
import searchLakeViewJson from "./__fixtures__/sparql-search-lake-view-cemetery.json";
import searchOaklandCemeteryJson from "./__fixtures__/sparql-search-oakland-cemetery.json";
import searchOaklandJson from "./__fixtures__/sparql-search-oakland.json";
import { DataSourceError } from "./errors";
import { setTransportForTests } from "./wikimedia";
import {
  burialsQuery,
  fetchSearch,
  flattenBindings,
  mentionsCemetery,
  mergeSearchResults,
  SEARCH_LIMIT,
  searchWithFallback,
  nearQuery,
  parseBurialRows,
  parseCemeteryFacts,
  parseNearRows,
  parseSearchRows,
  pickPlace,
  QID_RE,
  searchQuery,
  sparqlString,
} from "./wikidata";

afterEach(() => setTransportForTests(null));

describe("burials", () => {
  it("query groups by person, samples each field and caps at 80", () => {
    const q = burialsQuery("Q2008469");
    expect(q).toContain("ps:P119 wd:Q2008469");
    expect(q).toContain("GROUP BY ?person ?personLabel ?personDescription");
    expect(q).toContain("SAMPLE(?fag_)");
    expect(q).toMatch(/LIMIT 80$/);
  });

  it("takes birth and death from best-rank statements only (regression: Margaret Mitchell)", () => {
    const q = burialsQuery("Q2008469");
    expect(q).toContain("?person p:P569 ?bst . ?bst a wikibase:BestRank ; psv:P569");
    expect(q).toContain("?person p:P570 ?dst . ?dst a wikibase:BestRank ; psv:P570");
    expect(q).not.toContain("p:P569/psv:P569");
    // Recorded with the fixed query: her preferred birth date, not the normal-rank Nov 9.
    const mitchell = parseBurialRows(flattenBindings(burialsJson)).find((r) => r.person.qid === "Q173540")!;
    expect(mitchell.person.birth).toBe("1900-11-08T00:00:00Z");
  });

  it("parses the recorded Oakland Cemetery burials into people", () => {
    const raw = flattenBindings(burialsJson);
    expect(raw).toHaveLength(80);
    const rows = parseBurialRows(raw);
    // Two of the 80 recorded rows have only their QID as a label (F20); both have an article, so both stay, named by it.
    expect(rows).toHaveLength(80);
    const mitchell = rows.find((r) => r.person.name === "Margaret Mitchell")!;
    expect(mitchell.person).toMatchObject({ qid: "Q173540", findAGraveId: "718", birthPrecision: 11, deathPrecision: 11 });
    expect(mitchell.person.occupations).toContain("novelist");
    expect(mitchell.person.mannersOfDeath).toEqual(["accidental death"]);
    expect(mitchell.enwiki).toBe("https://en.wikipedia.org/wiki/Margaret_Mitchell");
    // Ordered by sitelinks, most first.
    expect(rows[0].person.sitelinks).toBeGreaterThanOrEqual(rows[rows.length - 1].person.sitelinks);
    // The person-level coordinate stands in when the burial has no P625 qualifier.
    expect(rows.filter((r) => r.person.graveCoord).length).toBeGreaterThanOrEqual(1);
  });
});

describe("people with no English label (F20)", () => {
  it("names the recorded Oakland rows whose label is their QID from their English Wikipedia articles", () => {
    const raw = flattenBindings(burialsJson);
    const qidNamed = raw.filter((r) => /^Q\d+$/.test(r.personLabel ?? "")).map((r) => r.person.split("/").pop());
    expect(qidNamed.sort()).toEqual(["Q6066179", "Q6986296"]);
    const rows = parseBurialRows(raw);
    const byQid = new Map(rows.map((r) => [r.person.qid, r]));
    expect(byQid.get("Q6986296")?.person.name).toBe("Nedom L. Angier");
    expect(byQid.get("Q6066179")?.person.name).toBe("Ira O. McDaniel");
    expect(rows.every((r) => !/^Q\d+$/.test(r.person.name))).toBe(true);
  });

  it("strips a disambiguator from the title, and drops a bare-QID row with no article", () => {
    const row = (label: string | undefined, enwiki?: string) => ({
      person: "http://www.wikidata.org/entity/Q42",
      ...(label ? { personLabel: label } : {}),
      ...(enwiki ? { enwiki } : {}),
    });
    expect(parseBurialRows([row("Q42", "https://en.wikipedia.org/wiki/Nedom_L._Angier_(politician)")])[0].person.name).toBe("Nedom L. Angier");
    expect(parseBurialRows([row("Q42")])).toEqual([]);
    expect(parseBurialRows([row(undefined)])).toEqual([]);
    expect(parseBurialRows([row(undefined, "https://en.wikipedia.org/wiki/Douglas_Adams")])[0].person.name).toBe("Douglas Adams");
    // A real label always wins over the title.
    expect(parseBurialRows([row("Bobby Jones", "https://en.wikipedia.org/wiki/Bobby_Jones_(golfer)")])[0].person.name).toBe("Bobby Jones");
  });
});

describe("cemetery facts", () => {
  it("parses Oakland Cemetery", () => {
    expect(parseCemeteryFacts("Q2008469", flattenBindings(factsJson))).toEqual({
      qid: "Q2008469",
      name: "Oakland Cemetery",
      description: "cemetery in Atlanta, Georgia, USA",
      locatedIn: "Atlanta",
      coord: "Point(-84.371333 33.748722)",
      findAGraveCemeteryId: "35955",
      enwiki: "https://en.wikipedia.org/wiki/Oakland_Cemetery_(Atlanta)",
    });
  });

  it("returns null for an item that doesn't exist (no schema:version)", () => {
    expect(parseCemeteryFacts("Q999999999999", [{ c: "http://www.wikidata.org/entity/Q999999999999", cLabel: "Q999999999999" }])).toBeNull();
  });
});

describe("near", () => {
  it("query uses wikibase:around with a 10 km radius and cemetery subclasses", () => {
    const q = nearQuery(47.6339, -122.3158);
    expect(q).toContain('"Point(-122.3158 47.6339)"^^geo:wktLiteral');
    expect(q).toContain('wikibase:radius "10"');
    expect(q).toContain("wdt:P31/wdt:P279* wd:Q39614");
    expect(q).toContain("GROUP BY ?c");
  });

  it("lists Lake View and the GAR cemetery once each, nearest first, with the place name", () => {
    const list = parseNearRows(flattenBindings(nearLakeViewJson));
    const names = list.map((c) => c.name);
    expect(names.filter((n) => n === "Lake View Cemetery")).toHaveLength(1);
    expect(names.filter((n) => n === "Grand Army of the Republic Cemetery")).toHaveLength(1);
    expect(list[0]).toMatchObject({ qid: "Q872253", name: "Lake View Cemetery", locatedIn: "Seattle", findAGraveCemeteryId: "76890" });
    expect(list[0].burials).toBeGreaterThan(50);
    expect(new Set(list.map((c) => c.qid)).size).toBe(list.length);
    for (let i = 1; i < list.length; i++) expect(list[i].distanceKm).toBeGreaterThanOrEqual(list[i - 1].distanceKm);
    expect(list.every((c) => c.distanceKm <= 10)).toBe(true);
  });

  it("handles a dense city center without duplicates", () => {
    const list = parseNearRows(flattenBindings(nearManhattanJson));
    expect(list.length).toBeGreaterThan(10);
    expect(new Set(list.map((c) => c.qid)).size).toBe(list.length);
  });
});

describe("search", () => {
  it("escapes the search text as a SPARQL literal", () => {
    expect(sparqlString('say "hi" \\ bye\nnow')).toBe('"say \\"hi\\" \\\\ bye now"');
    expect(searchQuery('x" } DELETE {')).toContain('mwapi:search "x\\" } DELETE {"');
  });

  it("shows the town and state for each same-named Lake View Cemetery", () => {
    const results = parseSearchRows(flattenBindings(searchLakeViewJson));
    expect(results[0]).toMatchObject({ qid: "Q872253", name: "Lake View Cemetery", locatedIn: "Seattle", region: "Washington" });
    const lakeViews = results.filter((r) => r.name === "Lake View Cemetery");
    expect(lakeViews.length).toBeGreaterThan(5);
    // Every same-named result carries a place, so a visitor can tell them apart.
    expect(lakeViews.every((r) => r.locatedIn || r.region)).toBe(true);
  });

  it("prefers the town over the county when a cemetery has both", () => {
    expect(pickPlace("Fulton County|Atlanta")).toBe("Atlanta");
    expect(pickPlace("Seattle")).toBe("Seattle");
    expect(pickPlace(undefined)).toBeNull();
  });

  it("retries once with ' cemetery' when the words don't say cemetery and nothing matched", async () => {
    const urls: string[] = [];
    const empty = { results: { bindings: [] } };
    const responses = [empty, searchLakeViewJson];
    setTransportForTests({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        urls.push(decodeURIComponent(String(input)));
        return new Response(JSON.stringify(responses.shift()), { status: 200 });
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    const results = await fetchSearch("lake view");
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('mwapi:search "lake view cemetery"');
    expect(results.length).toBeGreaterThan(0);
    expect(mentionsCemetery("Lake View Cemetery")).toBe(true);
    expect(mentionsCemetery("oakland")).toBe(false);
  });

});

describe("search widening (F18)", () => {
  type Reply = SparqlJsonLike | Error;
  type SparqlJsonLike = { results: { bindings: unknown[] } };
  const empty: SparqlJsonLike = { results: { bindings: [] } };
  const row = (qid: string, label: string, burials: number) => ({
    item: { value: `http://www.wikidata.org/entity/${qid}` },
    label: { value: label },
    burials: { value: String(burials) },
  });

  /** Mocked SPARQL: the reply depends on the search text; records every search sent. */
  function mockSparql(replies: Record<string, Reply>) {
    const searches: string[] = [];
    setTransportForTests({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const query = new URL(String(input)).searchParams.get("query") ?? "";
        const term = JSON.parse(query.match(/mwapi:search ("(?:[^"\\]|\\.)*")/)![1]) as string;
        searches.push(term);
        const reply = replies[term] ?? empty;
        if (reply instanceof Error) return new Response("busy", { status: 400 });
        return new Response(JSON.stringify(reply), { status: 200 });
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    return searches;
  }

  it('"oakland" (2 results, Pennsylvania first) also searches "oakland cemetery" and ranks Atlanta first', async () => {
    const searches = mockSparql({ oakland: searchOaklandJson, "oakland cemetery": searchOaklandCemeteryJson });
    const results = await fetchSearch("oakland");
    expect(searches).toEqual(["oakland", "oakland cemetery"]);
    // Recorded: "oakland" alone gives West Chester (40 people) before Atlanta (115).
    expect(parseSearchRows(flattenBindings(searchOaklandJson)).map((r) => r.locatedIn)).toEqual(["West Chester", "Atlanta"]);
    expect(results[0]).toMatchObject({ qid: "Q2008469", name: "Oakland Cemetery", locatedIn: "Atlanta", burials: 115 });
    // One entry per QID, most people listed first, capped at 20.
    expect(new Set(results.map((r) => r.qid)).size).toBe(results.length);
    expect(results.length).toBe(SEARCH_LIMIT);
    for (let i = 1; i < results.length; i++) expect(results[i].burials).toBeLessThanOrEqual(results[i - 1].burials);
    expect(results.map((r) => r.locatedIn)).toContain("West Chester");
  });

  it("keeps search order among equal counts, plain results first", () => {
    const merged = mergeSearchResults(
      parseSearchRows([
        { item: "http://www.wikidata.org/entity/Q1", label: "A", burials: "0" },
        { item: "http://www.wikidata.org/entity/Q2", label: "B", burials: "3" },
      ]),
      parseSearchRows([
        { item: "http://www.wikidata.org/entity/Q3", label: "C", burials: "0" },
        { item: "http://www.wikidata.org/entity/Q2", label: "B again", burials: "3" },
        { item: "http://www.wikidata.org/entity/Q4", label: "D", burials: "3" },
      ]),
    );
    expect(merged.map((r) => r.name)).toEqual(["B", "D", "A", "C"]);
    // With no counts at all, it is plain search order.
    const none = mergeSearchResults(parseSearchRows([{ item: "http://www.wikidata.org/entity/Q9", label: "Z" }]), parseSearchRows([{ item: "http://www.wikidata.org/entity/Q8", label: "Y" }]));
    expect(none.map((r) => r.name)).toEqual(["Z", "Y"]);
  });

  it("runs one query when the words already say cemetery, or when 5+ came back", async () => {
    for (const q of ["oakland cemetery", "bethany graveyard", "st mary churchyard", "quaker burial ground", "forest memorial park"]) {
      const searches = mockSparql({ [q]: searchOaklandJson });
      await fetchSearch(q);
      expect(searches, q).toEqual([q]);
    }
    const searches = mockSparql({ "lake view": searchLakeViewJson });
    const results = await fetchSearch("lake view");
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(searches).toEqual(["lake view"]);
    // 5+ results keep search order (no re-ranking).
    expect(results.map((r) => r.qid)).toEqual(parseSearchRows(flattenBindings(searchLakeViewJson)).map((r) => r.qid));
  });

  it("never sends more than 2 queries, even when both come back short", async () => {
    const searches = mockSparql({ zzz: { results: { bindings: [row("Q11", "Zzz Cemetery", 2)] } } });
    const results = await fetchSearch("zzz");
    expect(searches).toEqual(["zzz", "zzz cemetery"]);
    expect(results.map((r) => r.qid)).toEqual(["Q11"]);
  });

  it("keeps the first results when the widened search fails, and names the failure when there are none", async () => {
    mockSparql({ oakland: searchOaklandJson, "oakland cemetery": new Error("down") });
    expect((await fetchSearch("oakland")).map((r) => r.locatedIn)).toEqual(["West Chester", "Atlanta"]);

    mockSparql({ nowhere: empty, "nowhere cemetery": new Error("down") });
    await expect(fetchSearch("nowhere")).rejects.toBeInstanceOf(DataSourceError);

    // The single-search function is pluggable (the app passes the cached one).
    const calls: string[] = [];
    const once = async (q: string) => {
      calls.push(q);
      return [];
    };
    expect(await searchWithFallback("oakland", once)).toEqual([]);
    expect(calls).toEqual(["oakland", "oakland cemetery"]);
  });
});

describe("QIDs", () => {
  it("accepts only real QIDs", () => {
    expect(QID_RE.test("Q2008469")).toBe(true);
    for (const bad of ["Q0", "q1", "Q", "Q1 ", "P31", "Q12345678901234", "Q1;DROP"]) expect(QID_RE.test(bad)).toBe(false);
  });
});
