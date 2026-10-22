import { describe, expect, it } from "vitest";
import { burialsQuery, NON_PUBLIC_TYPES, profilesQuery } from "./sparql";

describe("profilesQuery", () => {
  const q = profilesQuery(33.7486, -84.3733, 25);

  it("asks around the point within the radius, for cemeteries via subclass", () => {
    expect(q).toContain('wikibase:center "Point(-84.3733 33.7486)"^^geo:wktLiteral');
    expect(q).toContain('wikibase:radius "25"');
    expect(q).toContain("?c wdt:P31/wdt:P279* wd:Q39614");
    expect(q).toContain("GROUP BY ?c");
  });

  it("flags every non-public class (via subclass) and P576", () => {
    expect(Object.keys(NON_PUBLIC_TYPES).sort()).toEqual(["Q107334193", "Q107684101", "Q163778", "Q73218016"]);
    for (const qid of Object.keys(NON_PUBLIC_TYPES)) {
      expect(q).toContain(`EXISTS { ?c wdt:P31/wdt:P279* wd:${qid} }`);
    }
    expect(q).toContain("EXISTS { ?c wdt:P576 [] }");
  });

  it("reads dates and areas from best-rank statements", () => {
    expect(q).toMatch(/p:P571 \?incSt \. \?incSt a wikibase:BestRank/);
    expect(q).toMatch(/p:P2046 \?areaSt \. \?areaSt a wikibase:BestRank/);
    for (const p of ["P131", "P18", "P1435", "P2025"]) expect(q).toContain(`wdt:${p}`);
    expect(q).toContain("schema:isPartOf <https://en.wikipedia.org/>");
  });

  it("refuses non-numbers", () => {
    expect(() => profilesQuery(Number.NaN, 0, 25)).toThrow();
  });

  it('reads every label in English, else "mul" (K14), keeping the output variables', () => {
    for (const [item, out] of [
      ["?c", "?label"],
      ["?placeItem", "?placeLabel"],
      ["?heritageItem", "?heritageLabel"],
      ["?type", "?typeLabel"],
    ]) {
      expect(q).toContain(`OPTIONAL { ${item} rdfs:label ${out}En FILTER(LANG(${out}En) = "en") }`);
      expect(q).toContain(`OPTIONAL { ${item} rdfs:label ${out}Mul FILTER(LANG(${out}Mul) = "mul") }`);
      expect(q).toContain(`BIND(COALESCE(${out}En, ${out}Mul) AS ${out})`);
    }
    for (const v of ["?name", "?places", "?heritage", "?types"]) expect(q.split("WHERE")[0]).toContain(`AS ${v})`);
  });

  it("asks only for cemeteries (the Q39614 tree the tour's facts check uses), so every card's /cemetery link opens", () => {
    expect(q.match(/wdt:P31\/wdt:P279\* wd:Q39614 \./g)).toHaveLength(1);
  });
});

describe("burialsQuery", () => {
  it("lists humans buried at the given cemeteries with sitelinks", () => {
    const q = burialsQuery(["Q2008469", "Q360779", "bogus } DROP"]);
    expect(q).toContain("VALUES ?c { wd:Q2008469 wd:Q360779 }");
    expect(q).toContain("?p wdt:P119 ?c ; wdt:P31 wd:Q5 ; wikibase:sitelinks ?sitelinks");
    expect(q).not.toContain("bogus");
    expect(q).toContain('wikibase:language "en,mul"');
  });

  it("refuses an empty list", () => {
    expect(() => burialsQuery([])).toThrow();
  });
});
