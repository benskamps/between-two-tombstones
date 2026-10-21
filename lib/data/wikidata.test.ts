import { afterEach, describe, expect, it, vi } from "vitest";
import burialsJson from "./__fixtures__/sparql-burials-Q2008469.json";
import factsJson from "./__fixtures__/sparql-facts-Q2008469.json";
import nearLakeViewJson from "./__fixtures__/sparql-near-lakeview.json";
import nearManhattanJson from "./__fixtures__/sparql-near-manhattan.json";
import searchLakeViewJson from "./__fixtures__/sparql-search-lake-view-cemetery.json";
import { setTransportForTests } from "./wikimedia";
import {
  burialsQuery,
  fetchSearch,
  flattenBindings,
  hasRealName,
  isQidName,
  mentionsCemetery,
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
    // Two of the 80 recorded rows have only their QID as a label (F20); they're dropped.
    expect(rows).toHaveLength(78);
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
  it("treats a QID-shaped name as no name", () => {
    for (const id of ["Q16162799", "Q1", " Q6986296 "]) expect(isQidName(id)).toBe(true);
    for (const none of [undefined, null, ""]) expect(isQidName(none)).toBe(true);
    for (const name of ["Margaret Mitchell", "Q", "Quincy Adams", "Q-ship captain", "Q1 Smith", "John Q. Public"]) expect(isQidName(name)).toBe(false);
    expect(hasRealName({ name: "Q16162799" })).toBe(false);
    expect(hasRealName({ name: "Bobby Jones" })).toBe(true);
  });

  it("drops people whose label is their QID from the recorded Oakland rows", () => {
    const raw = flattenBindings(burialsJson);
    const qidNamed = raw.filter((r) => /^Q\d+$/.test(r.personLabel ?? "")).map((r) => r.person.split("/").pop());
    expect(qidNamed.sort()).toEqual(["Q6066179", "Q6986296"]);
    const rows = parseBurialRows(raw);
    expect(rows.some((r) => qidNamed.includes(r.person.qid))).toBe(false);
    expect(rows.every((r) => !/^Q\d+$/.test(r.person.name))).toBe(true);
    // A row with no label at all is dropped the same way.
    expect(parseBurialRows([{ person: "http://www.wikidata.org/entity/Q42" }])).toEqual([]);
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

  it("accepts only real QIDs", () => {
    expect(QID_RE.test("Q2008469")).toBe(true);
    for (const bad of ["Q0", "q1", "Q", "Q1 ", "P31", "Q12345678901234", "Q1;DROP"]) expect(QID_RE.test(bad)).toBe(false);
  });
});
