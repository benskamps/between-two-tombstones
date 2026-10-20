import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkPublic,
  commonsImage,
  compareProfiles,
  isPublicCemetery,
  parseBurials,
  parseEstablished,
  parseExtracts,
  parseProfileRow,
  parseProfiles,
  pickPlace,
  tidyIntro,
  toAcres,
  type SparqlJson,
} from "./parse";

// Recorded live 2026-10-20 03:00 UTC with lib/gravitator/sparql.ts for
// 33.7486, -84.3733 (downtown Atlanta), 25 km. Raw SPARQL JSON, unedited.
function fixture(name: string): SparqlJson {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"));
}
const profiles = fixture("atlanta-profiles.json");
const burials = fixture("atlanta-burials.json");
const NOW = new Date("2026-10-20T12:00:00Z");

const ENTITY = "http://www.wikidata.org/entity/";
/** A synthetic profiles row (not recorded): only what the filter looks at. */
function row(qid: string, name: string, extra: Record<string, string> = {}) {
  const b: Record<string, { type: string; value: string }> = {
    c: { type: "uri", value: ENTITY + qid },
    name: { type: "literal", value: name },
    coord: { type: "literal", value: "Point(-84.38 33.75)" },
    distance: { type: "literal", value: "1.5" },
    types: { type: "literal", value: "Q39614=cemetery" },
  };
  for (const [k, v] of Object.entries(extra)) b[k] = { type: "literal", value: v };
  return b;
}

describe("public filter (hard rule)", () => {
  it("drops each non-public class, found directly or via subclass", () => {
    for (const q of ["Q73218016", "Q107684101", "Q163778", "Q107334193"]) {
      // Via subclass: the query's EXISTS flag.
      expect(isPublicCemetery(parseProfileRow(row("Q1000", "Somewhere Cemetery", { [`not_${q}`]: "true" }))!)).toBe(false);
      // Directly: the P31 class itself (also what the browser re-checks on API cards).
      expect(isPublicCemetery({ name: "Somewhere Cemetery", typeIds: ["Q39614", q] })).toBe(false);
    }
  });

  it("drops anything with P576 (dissolved or abolished)", () => {
    const r = parseProfileRow(row("Q1001", "Old Town Burying Ground", { dissolved: "true" }))!;
    expect(checkPublic(r)).toEqual({ public: false, reason: "dissolved (P576)" });
  });

  it("drops classes whose label says family, private, pet, animal, abandoned or former", () => {
    for (const label of ["family cemetery", "private cemetery", "pet cemetery", "animal cemetery", "abandoned cemetery", "former cemetery"]) {
      expect(isPublicCemetery({ name: "Somewhere", types: [label] }), label).toBe(false);
    }
  });

  it("drops family, private and pet cemeteries that Wikidata only types as plain 'cemetery'", () => {
    for (const name of [
      "Parker Family Cemetery",
      "Johnson-Goldsmith-Maddox Family Cemetery",
      "Veal - Smith Family Cemetery",
      "Hightower Family Burial Ground",
      "Smith Private Cemetery",
      "Hartsdale Pet Cemetery",
      "Old Abandoned Graveyard",
    ]) {
      expect(isPublicCemetery({ name, typeIds: ["Q39614"], types: [] }), name).toBe(false);
    }
  });

  it("keeps public cemeteries, churchyards, war cemeteries and memorial gardens", () => {
    for (const [name, types] of [
      ["Oakland Cemetery", []],
      ["Patrick R. Cleburne Confederate Cemetery", ["war cemetery"]],
      ["Decatur Cemetery", ["historic district", "war cemetery"]],
      ["Saint Anne's Episcopal Church Memorial Garden", []],
      ["Antioch Baptist Church Cemetery", []],
      ["Sleepy Hollow Cemetery", ["garden cemetery"]],
    ] as const) {
      expect(isPublicCemetery({ name, types: [...types], typeIds: ["Q39614"] }), name).toBe(true);
    }
  });

  it("leaves every family cemetery out of the recorded Atlanta deck", () => {
    const { rows, excluded } = parseProfiles(profiles, NOW);
    expect(profiles.results.bindings).toHaveLength(246);
    expect(excluded).toBe(29);
    expect(rows).toHaveLength(217);
    expect(rows.filter((r) => /family|private|pet cemetery|abandoned/i.test(r.name))).toEqual([]);
  });
});

describe("profiles from the recorded Atlanta query", () => {
  const { rows } = parseProfiles(profiles, NOW);
  const byQid = new Map(rows.map((r) => [r.qid, r]));

  it("reads Oakland Cemetery's full profile", () => {
    const oak = byQid.get("Q2008469")!;
    expect(oak).toMatchObject({
      name: "Oakland Cemetery",
      place: "Atlanta",
      lat: 33.748722,
      lon: -84.371333,
      distanceKm: 0.182,
      image: "https://commons.wikimedia.org/wiki/Special:FilePath/Oakland_Cemetery_and_Atlanta_Skyscrapers.jpg?width=500",
      imageFile: "Oakland Cemetery and Atlanta Skyscrapers.jpg",
      established: { year: 1850, precision: 9 },
      // Wikidata stores 48 with the unit acre (Q81292), not hectares.
      acres: 48,
      heritage: ["National Register of Historic Places listed place"],
      types: [],
      findAGraveId: "35955",
      enwiki: "Oakland Cemetery (Atlanta)",
    });
  });

  it("keeps the type labels other than plain cemetery", () => {
    expect(byQid.get("Q5248766")!.types.sort()).toEqual(["historic district", "war cemetery"]);
  });

  it("has every card optional beyond name and point: most rows are sparse", () => {
    const sparse = rows.filter((r) => !r.established && !r.acres && !r.heritage.length && !r.image && !r.enwiki);
    expect(sparse.length).toBeGreaterThan(150);
    for (const r of rows) {
      expect(r.name).toBeTruthy();
      expect(Number.isFinite(r.lat) && Number.isFinite(r.lon)).toBe(true);
    }
  });

  it("skips rows without a name or a point", () => {
    expect(parseProfileRow({ c: { type: "uri", value: ENTITY + "Q5" } })).toBeNull();
    const b = row("Q6", "Q6");
    expect(parseProfileRow(b)).toBeNull();
  });
});

describe("field helpers", () => {
  it("converts P2046 to acres by its unit and never guesses an unknown unit", () => {
    expect(toAcres("48", ENTITY + "Q81292")).toBe(48); // acre
    expect(toAcres("48", ENTITY + "Q35852")).toBe(119); // hectare × 2.471
    expect(toAcres("20000", ENTITY + "Q25343")).toBe(4.9); // square metre
    expect(toAcres("1.2", ENTITY + "Q712226")).toBe(297); // square kilometre
    expect(toAcres("48", ENTITY + "Q11573")).toBeNull(); // metre: not an area
    expect(toAcres(null, null)).toBeNull();
  });

  it("reads the founding year with its precision", () => {
    expect(parseEstablished("1850-01-01T00:00:00Z", "9", NOW)).toEqual({ year: 1850, precision: 9 });
    expect(parseEstablished("1850-06-12T00:00:00Z", "11", NOW)).toEqual({ year: 1850, precision: 9 });
    expect(parseEstablished("1850-01-01T00:00:00Z", "8", NOW)).toEqual({ year: 1850, precision: 8 });
    expect(parseEstablished("1801-01-01T00:00:00Z", "6", NOW)).toBeNull(); // millennium: too vague
    expect(parseEstablished("2999-01-01T00:00:00Z", "9", NOW)).toBeNull();
  });

  it("prefers a town over a county", () => {
    expect(pickPlace(["Fulton County", "Atlanta"])).toBe("Atlanta");
    expect(pickPlace(["DeKalb County"])).toBe("DeKalb County");
    expect(pickPlace([])).toBeNull();
  });

  it("builds https Commons thumbnails at the standard width", () => {
    expect(commonsImage("http://commons.wikimedia.org/wiki/Special:FilePath/Decatur%20Cemetery%2004.jpg")).toEqual({
      url: "https://commons.wikimedia.org/wiki/Special:FilePath/Decatur_Cemetery_04.jpg?width=500",
      file: "Decatur Cemetery 04.jpg",
    });
    expect(commonsImage("https://example.com/x.jpg")).toBeNull();
  });
});

describe("notable burials from the recorded query", () => {
  const map = parseBurials(burials, NOW);

  it("counts people per cemetery and keeps the top 3 by sitelinks", () => {
    const oak = map.get("Q2008469")!;
    expect(oak.count).toBe(114);
    expect(oak.top.map((p) => p.name)).toEqual(["Margaret Mitchell", "Bobby Jones", "John B. Gordon"]);
    expect(oak.top[0]).toEqual({ qid: "Q173540", name: "Margaret Mitchell", deathYear: 1949, recent: false });
  });

  it("marks deaths within 25 years as recent (name only on the card)", () => {
    const southView = map.get("Q97957208")!;
    expect(southView.top.map((p) => [p.name, p.recent])).toEqual([
      ["Toni Morrison", true],
      ["Hank Aaron", true],
      ["John Lewis", true],
    ]);
  });

  it("counts a person once even when they come back on two rows", () => {
    const json: SparqlJson = {
      results: {
        bindings: [1, 2].map((i) => ({
          c: { type: "uri", value: ENTITY + "Q1" },
          p: { type: "uri", value: ENTITY + "Q2" },
          pLabel: { type: "literal", value: "Someone" },
          sitelinks: { type: "literal", value: "3" },
          death: { type: "literal", value: `190${i}-01-01T00:00:00Z` },
        })),
      },
    };
    const one = parseBurials(json, NOW).get("Q1")!;
    expect(one.count).toBe(1);
    expect(one.top[0].deathYear).toBe(1901);
  });

  it("orders the deck by notable burials, then distance", () => {
    const { rows } = parseProfiles(profiles, NOW);
    const sorted = rows.map((r) => ({ ...r, notable: map.get(r.qid) ?? { count: 0, top: [] } })).sort(compareProfiles);
    expect(sorted.slice(0, 4).map((c) => c.name)).toEqual([
      "Oakland Cemetery",
      "Westview Cemetery",
      "South-View Cemetery",
      "Arlington Memorial Park",
    ]);
    const zero = sorted.filter((c) => c.notable.count === 0);
    for (let i = 1; i < zero.length; i++) expect(zero[i].distanceKm).toBeGreaterThanOrEqual(zero[i - 1].distanceKm);
  });
});

describe("Wikipedia intros", () => {
  // Synthetic response in the Action API's formatversion=2 shape (en.wikipedia.org
  // rate-limited the build container when we tried to record one).
  const json = {
    batchcomplete: true,
    query: {
      normalized: [{ from: "oakland Cemetery (Atlanta)", to: "Oakland Cemetery (Atlanta)" }],
      redirects: [{ from: "Westview Cemetery", to: "Westview Cemetery (Atlanta)" }],
      pages: [
        { pageid: 1, ns: 0, title: "Oakland Cemetery (Atlanta)", extract: "First sentence. Second sentence.\n\n\nThird." },
        { pageid: 2, ns: 0, title: "Westview Cemetery (Atlanta)", extract: "A redirect target." },
        { ns: 0, title: "Nowhere Cemetery", missing: true },
      ],
    },
  };

  it("follows normalization and redirects back to the requested titles", () => {
    const out = parseExtracts(json, ["oakland Cemetery (Atlanta)", "Westview Cemetery", "Nowhere Cemetery"]);
    expect(out.get("oakland Cemetery (Atlanta)")).toEqual({
      intro: "First sentence. Second sentence.\n\nThird.",
      url: "https://en.wikipedia.org/wiki/Oakland_Cemetery_(Atlanta)",
    });
    expect(out.get("Westview Cemetery")!.url).toBe("https://en.wikipedia.org/wiki/Westview_Cemetery_(Atlanta)");
    expect(out.has("Nowhere Cemetery")).toBe(false);
  });

  it("caps long intros at a sentence end", () => {
    const long = Array.from({ length: 80 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const t = tidyIntro(long);
    expect(t.length).toBeLessThanOrEqual(1500);
    expect(t.endsWith(".")).toBe(true);
  });
});
