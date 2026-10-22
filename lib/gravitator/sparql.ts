// The two Wikidata queries behind the Gravitator deck. Pure string builders, no
// imports, so scripts can load this file directly.

/** Never shown: Wikidata classes for cemeteries that aren't open to the public. */
export const NON_PUBLIC_TYPES: Record<string, string> = {
  Q73218016: "family cemetery",
  Q107684101: "private cemetery",
  Q163778: "animal cemetery",
  Q107334193: "abandoned graveyard",
};

export const CEMETERY = "Q39614";
export const HUMAN = "Q5";

const QID = /^Q[1-9]\d*$/;

/**
 * Binds `out` to `item`'s English label, or else its "mul" label (Wikidata's
 * language-neutral labels, where many names now live only); unbound when it
 * has neither. The same as labelEnMul in lib/data/wikidata.ts, kept here so
 * this file stays import-free.
 */
export function labelEnMul(item: string, out: string): string {
  const en = `${out}En`;
  const mul = `${out}Mul`;
  return [
    `OPTIONAL { ${item} rdfs:label ${en} FILTER(LANG(${en}) = "en") }`,
    `OPTIONAL { ${item} rdfs:label ${mul} FILTER(LANG(${mul}) = "mul") }`,
    `BIND(COALESCE(${en}, ${mul}) AS ${out})`,
  ].join("\n    ");
}

function num(n: number, digits: number): string {
  if (!Number.isFinite(n)) throw new Error("not a number");
  return n.toFixed(digits);
}

/**
 * One row per cemetery within `radiusKm` of the point (wikibase:around).
 *
 * Every cemetery comes back with flags for the non-public classes (via
 * subclass) and for P576 (dissolved), and the code drops flagged rows in
 * `isPublicCemetery`, so the rule lives in one tested place. Dates and areas
 * use best-rank statements only (PLAN.md Hour 0: SAMPLE over all ranks picked
 * the wrong date for Margaret Mitchell).
 */
export function profilesQuery(lat: number, lon: number, radiusKm: number): string {
  const flags = Object.keys(NON_PUBLIC_TYPES)
    .map((q) => `  BIND(EXISTS { ?c wdt:P31/wdt:P279* wd:${q} } AS ?not_${q})`)
    .join("\n");
  const flagVars = Object.keys(NON_PUBLIC_TYPES)
    .map((q) => `?not_${q}`)
    .join(" ");
  return `SELECT ?c (SAMPLE(?label) AS ?name) (GROUP_CONCAT(DISTINCT ?placeLabel; separator="|") AS ?places) (SAMPLE(?coord) AS ?coord)
  (MIN(?dist) AS ?distance) (SAMPLE(?image) AS ?image)
  (SAMPLE(?inception) AS ?inception) (SAMPLE(?inceptionPrecision) AS ?inceptionPrecision)
  (SAMPLE(?area) AS ?area) (SAMPLE(?areaUnit) AS ?areaUnit)
  (SAMPLE(?fag) AS ?findAGrave) (SAMPLE(?articleTitle) AS ?enwiki)
  (GROUP_CONCAT(DISTINCT ?heritageLabel; separator="|") AS ?heritage)
  (GROUP_CONCAT(DISTINCT ?typePair; separator="|") AS ?types)
  ${flagVars} ?dissolved
WHERE {
  SERVICE wikibase:around {
    ?c wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${num(lon, 4)} ${num(lat, 4)})"^^geo:wktLiteral ;
                    wikibase:radius "${num(radiusKm, 0)}" ;
                    wikibase:distance ?dist .
  }
  ?c wdt:P31/wdt:P279* wd:${CEMETERY} .
${flags}
  BIND(EXISTS { ?c wdt:P576 [] } AS ?dissolved)
  ${labelEnMul("?c", "?label")}
  OPTIONAL { ?c wdt:P131 ?placeItem .
    ${labelEnMul("?placeItem", "?placeLabel")} }
  OPTIONAL { ?c wdt:P18 ?image }
  OPTIONAL {
    ?c p:P571 ?incSt . ?incSt a wikibase:BestRank ;
      psv:P571 [ wikibase:timeValue ?inception ; wikibase:timePrecision ?inceptionPrecision ] .
  }
  OPTIONAL {
    ?c p:P2046 ?areaSt . ?areaSt a wikibase:BestRank ;
      psv:P2046 [ wikibase:quantityAmount ?area ; wikibase:quantityUnit ?areaUnit ] .
  }
  OPTIONAL { ?c wdt:P1435 ?heritageItem .
    ${labelEnMul("?heritageItem", "?heritageLabel")} }
  OPTIONAL {
    ?c wdt:P31 ?type .
    ${labelEnMul("?type", "?typeLabel")}
    BIND(CONCAT(STRAFTER(STR(?type), "/entity/"), "=", COALESCE(?typeLabel, "")) AS ?typePair)
  }
  OPTIONAL { ?c wdt:P2025 ?fag }
  OPTIONAL { ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?articleTitle }
}
GROUP BY ?c ${flagVars} ?dissolved`;
}

/**
 * Every person (P31 human) with P119 burial place = one of the cemeteries, with
 * their sitelink count (the fame signal) and death date (for the respect
 * rules). The deck counts them per cemetery and keeps the top 3 by sitelinks.
 */
export function burialsQuery(qids: string[]): string {
  const values = qids.filter((q) => QID.test(q)).map((q) => `wd:${q}`);
  if (values.length === 0) throw new Error("no cemeteries");
  return `SELECT ?c ?p ?pLabel ?sitelinks ?death WHERE {
  VALUES ?c { ${values.join(" ")} }
  ?p wdt:P119 ?c ; wdt:P31 wd:${HUMAN} ; wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?p wdt:P570 ?death }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;
}
