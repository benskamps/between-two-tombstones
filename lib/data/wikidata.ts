// Wikidata SPARQL: burials at a cemetery, cemetery facts, cemeteries near a
// point, and cemetery search. Queries are ported from scripts/burials.mjs,
// scripts/snapshot.mjs and scripts/hour0-probe.mjs (verified live on 10/20).
// Everything here is uncached; lib/data/cached.ts wraps it in 'use cache: remote'.

import { personName } from "@/lib/tour/text";
import type { Cemetery, Person } from "@/lib/types";
import { DataSourceError } from "./errors";
import type { CemeterySearchResult, NearbyCemetery } from "./types";
import { politeJson, REQUEST_PATH } from "./wikimedia";
import { titleFromUrl } from "./wikipedia";

export const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
export const BURIALS_LIMIT = 80;
export const NEAR_RADIUS_KM = 10;
export const NEAR_LIMIT = 40;
export const SEARCH_LIMIT = 20;

export type SparqlRow = Record<string, string>;
export type SparqlJson = { results?: { bindings?: Record<string, { value: string } | undefined>[] } };

export const QID_RE = /^Q[1-9]\d{0,11}$/;

/** Flatten SPARQL JSON bindings into { var: value } rows. */
export function flattenBindings(json: SparqlJson): SparqlRow[] {
  const bindings = json?.results?.bindings;
  if (!Array.isArray(bindings)) {
    throw new DataSourceError("Wikidata", "bad-response", "The SPARQL endpoint answered without results.");
  }
  return bindings.map((b) => Object.fromEntries(Object.entries(b).flatMap(([k, v]) => (v ? [[k, v.value]] : []))));
}

export async function sparql(query: string): Promise<SparqlRow[]> {
  const url = `${SPARQL_ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const json = await politeJson<SparqlJson>(url, {
    source: "Wikidata",
    ...REQUEST_PATH,
    init: { headers: { Accept: "application/sparql-results+json" } },
    // The SPARQL endpoint was fine with back-to-back queries in Hour 0.
    spacingMs: 0,
  });
  return flattenBindings(json);
}

/** Escape a user string for a SPARQL double-quoted literal. */
export function sparqlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n|\r/g, " ")}"`;
}

const idOf = (uri: string | undefined) => uri?.split("/").pop() ?? "";
const split = (v: string | undefined) => (v ? v.split("|").filter(Boolean) : []);
const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

const AREA_WORDS = /\b(county|township|parish|district|borough|municipality|region|province|prefecture)\b/i;

/**
 * A cemetery can sit in several P131 places ("Atlanta|Fulton County"). Prefer
 * the town over the county, then the shortest name, so the pick is stable.
 */
export function pickPlace(places: string | undefined): string | null {
  const list = split(places);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => Number(AREA_WORDS.test(a)) - Number(AREA_WORDS.test(b)) || a.length - b.length || a.localeCompare(b))[0];
}

// ---------------------------------------------------------------- burials

/**
 * One row per person buried at the cemetery; multi-valued fields are |-joined.
 * Birth and death come only from best-rank statements: Margaret Mitchell has a
 * preferred 1900-11-08 and a normal-rank 1900-11-09, and SAMPLE over all ranks
 * could pick the wrong one.
 * Ties on sitelinks are broken by the QID's number, lowest (oldest item) first,
 * so the LIMIT cut is the same on every run: without it Wikidata sometimes put
 * other 1-sitelink people at the end of Oakland's 80. Numbers, not the IRI
 * string, which would favour "Q1…" items such as a newer "Grave of Bobby Jones".
 * scripts/burials.mjs has the same ORDER BY.
 */
export const burialsQuery = (qid: string, limit = BURIALS_LIMIT) => `
SELECT ?person ?personLabel ?personDescription
  (SAMPLE(?birth_) AS ?birth) (SAMPLE(?birthPrec_) AS ?birthPrecision)
  (SAMPLE(?death_) AS ?death) (SAMPLE(?deathPrec_) AS ?deathPrecision)
  (GROUP_CONCAT(DISTINCT ?causeLabel_; separator="|") AS ?causes)
  (GROUP_CONCAT(DISTINCT ?mannerLabel_; separator="|") AS ?manners)
  (GROUP_CONCAT(DISTINCT ?occLabel_; separator="|") AS ?occupations)
  (SAMPLE(?image_) AS ?image) (SAMPLE(?graveImage_) AS ?graveImage)
  (SAMPLE(?graveCoord_) AS ?graveCoord) (SAMPLE(?personCoord_) AS ?personCoord)
  (SAMPLE(?fag_) AS ?findAGraveId) (SAMPLE(?sitelinks_) AS ?sitelinks)
  (SAMPLE(?enwiki_) AS ?enwiki)
WHERE {
  ?person p:P119 ?burial . ?burial ps:P119 wd:${qid} .
  OPTIONAL { ?burial pq:P625 ?graveCoord_ }
  OPTIONAL { ?person p:P569 ?bst . ?bst a wikibase:BestRank ; psv:P569 [ wikibase:timeValue ?birth_ ; wikibase:timePrecision ?birthPrec_ ] }
  OPTIONAL { ?person p:P570 ?dst . ?dst a wikibase:BestRank ; psv:P570 [ wikibase:timeValue ?death_ ; wikibase:timePrecision ?deathPrec_ ] }
  OPTIONAL { ?person wdt:P509 ?cause . ?cause rdfs:label ?causeLabel_ FILTER(LANG(?causeLabel_) = "en") }
  OPTIONAL { ?person wdt:P1196 ?manner . ?manner rdfs:label ?mannerLabel_ FILTER(LANG(?mannerLabel_) = "en") }
  OPTIONAL { ?person wdt:P106 ?occ . ?occ rdfs:label ?occLabel_ FILTER(LANG(?occLabel_) = "en") }
  OPTIONAL { ?person wdt:P18 ?image_ }
  OPTIONAL { ?person wdt:P1442 ?graveImage_ }
  OPTIONAL { ?person wdt:P625 ?personCoord_ }
  OPTIONAL { ?person wdt:P535 ?fag_ }
  OPTIONAL { ?person wikibase:sitelinks ?sitelinks_ }
  OPTIONAL { ?enwiki_ schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?person ?personLabel ?personDescription
ORDER BY DESC(?sitelinks) xsd:integer(STRAFTER(STR(?person), "/entity/Q"))
LIMIT ${limit}`;

/** A person without the Wikipedia summary yet, plus the article URL to fetch it. */
export type PersonRow = { person: Omit<Person, "wikipedia">; enwiki: string | null };

/**
 * One person per row. A row whose label is only its QID (no English label)
 * takes its name from the English Wikipedia title; with no article either, it
 * is dropped (F20).
 */
export function parseBurialRows(rows: SparqlRow[]): PersonRow[] {
  return rows.flatMap((r) => {
    const name = personName(r.personLabel, r.enwiki ? titleFromUrl(r.enwiki) : null);
    return name ? [toPersonRow(r, name)] : [];
  });
}

function toPersonRow(r: SparqlRow, name: string): PersonRow {
  return {
    person: {
      qid: idOf(r.person),
      name,
      description: r.personDescription ?? null,
      birth: r.birth ?? null,
      birthPrecision: num(r.birthPrecision),
      death: r.death ?? null,
      deathPrecision: num(r.deathPrecision),
      causesOfDeath: split(r.causes),
      mannersOfDeath: split(r.manners),
      occupations: split(r.occupations),
      image: r.image ?? null,
      graveImage: r.graveImage ?? null,
      graveCoord: r.graveCoord ?? r.personCoord ?? null,
      findAGraveId: r.findAGraveId ?? null,
      sitelinks: r.sitelinks ? Number(r.sitelinks) : 0,
    },
    enwiki: r.enwiki ?? null,
  };
}

export async function fetchBurials(qid: string): Promise<PersonRow[]> {
  return parseBurialRows(await sparql(burialsQuery(qid)));
}

// ---------------------------------------------------------------- cemetery facts

export const cemeteryFactsQuery = (qid: string) => `
SELECT ?c ?cLabel ?cDescription ?coord ?fagc ?locLabel ?enwiki ?version WHERE {
  VALUES ?c { wd:${qid} }
  OPTIONAL { ?c schema:version ?version }
  OPTIONAL { ?c wdt:P625 ?coord } OPTIONAL { ?c wdt:P2025 ?fagc } OPTIONAL { ?c wdt:P131 ?loc }
  OPTIONAL { ?enwiki schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 1`;

/** Returns null when the item doesn't exist on Wikidata. */
export function parseCemeteryFacts(qid: string, rows: SparqlRow[]): Cemetery | null {
  const r = rows[0];
  if (!r || !r.version) return null;
  return {
    qid,
    name: r.cLabel ?? qid,
    description: r.cDescription ?? null,
    locatedIn: r.locLabel ?? null,
    coord: r.coord ?? null,
    findAGraveCemeteryId: r.fagc ?? null,
    enwiki: r.enwiki ?? null,
  };
}

export async function fetchCemeteryFacts(qid: string): Promise<Cemetery | null> {
  return parseCemeteryFacts(qid, await sparql(cemeteryFactsQuery(qid)));
}

// ---------------------------------------------------------------- near

/**
 * Cemeteries (any subclass of Q39614) within `radiusKm`, one row each
 * (an item with two coordinates or two P31 paths would otherwise repeat),
 * with the P131 place name and the number of people buried there.
 */
export const nearQuery = (lat: number, lon: number, radiusKm = NEAR_RADIUS_KM, limit = NEAR_LIMIT) => `
SELECT ?c (SAMPLE(?label_) AS ?label) (SAMPLE(?desc_) AS ?description) (MIN(?dist_) AS ?dist)
  (SAMPLE(?coord_) AS ?coord) (GROUP_CONCAT(DISTINCT ?placeLabel_; separator="|") AS ?places) (SAMPLE(?fagc_) AS ?fagc)
  (SAMPLE(?enwiki_) AS ?enwiki) (COUNT(DISTINCT ?buried) AS ?burials)
WHERE {
  SERVICE wikibase:around {
    ?c wdt:P625 ?coord_ .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral ;
      wikibase:radius "${radiusKm}" ; wikibase:distance ?dist_ .
  }
  ?c wdt:P31/wdt:P279* wd:Q39614 .
  OPTIONAL { ?c rdfs:label ?label_ FILTER(LANG(?label_) = "en") }
  OPTIONAL { ?c schema:description ?desc_ FILTER(LANG(?desc_) = "en") }
  OPTIONAL { ?c wdt:P131 ?place_ . ?place_ rdfs:label ?placeLabel_ FILTER(LANG(?placeLabel_) = "en") }
  OPTIONAL { ?c wdt:P2025 ?fagc_ }
  OPTIONAL { ?enwiki_ schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?buried wdt:P119 ?c }
}
GROUP BY ?c
ORDER BY ?dist
LIMIT ${limit}`;

export function parseNearRows(rows: SparqlRow[]): NearbyCemetery[] {
  const seen = new Set<string>();
  const out: NearbyCemetery[] = [];
  for (const r of rows) {
    const qid = idOf(r.c);
    if (!QID_RE.test(qid) || seen.has(qid)) continue;
    seen.add(qid);
    out.push({
      qid,
      name: r.label ?? qid,
      description: r.description ?? null,
      locatedIn: pickPlace(r.places),
      coord: r.coord ?? null,
      findAGraveCemeteryId: r.fagc ?? null,
      enwiki: r.enwiki ?? null,
      distanceKm: r.dist ? Math.round(Number(r.dist) * 100) / 100 : 0,
      burials: r.burials ? Number(r.burials) : 0,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function fetchNearby(lat: number, lon: number): Promise<NearbyCemetery[]> {
  return parseNearRows(await sparql(nearQuery(lat, lon)));
}

// ---------------------------------------------------------------- search

/** Entity search (labels and aliases), filtered to cemeteries, in search order. */
export const searchQuery = (q: string, limit = SEARCH_LIMIT) => `
SELECT ?item (SAMPLE(?label_) AS ?label) (SAMPLE(?desc_) AS ?description) (MIN(?ordinal_) AS ?ordinal)
  (GROUP_CONCAT(DISTINCT ?placeLabel_; separator="|") AS ?places) (SAMPLE(?stateLabel_) AS ?state)
  (SAMPLE(?countryLabel_) AS ?country) (SAMPLE(?coord_) AS ?coord)
  (SAMPLE(?fagc_) AS ?fagc) (SAMPLE(?enwiki_) AS ?enwiki) (COUNT(DISTINCT ?buried) AS ?burials)
WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";
      mwapi:search ${sparqlString(q)}; mwapi:language "en"; mwapi:limit "50" .
    ?item wikibase:apiOutputItem mwapi:item .
    ?ordinal_ wikibase:apiOrdinal true .
  }
  ?item wdt:P31/wdt:P279* wd:Q39614 .
  OPTIONAL { ?item rdfs:label ?label_ FILTER(LANG(?label_) = "en") }
  OPTIONAL { ?item schema:description ?desc_ FILTER(LANG(?desc_) = "en") }
  OPTIONAL { ?item wdt:P131 ?place_ . ?place_ rdfs:label ?placeLabel_ FILTER(LANG(?placeLabel_) = "en") }
  OPTIONAL { ?item wdt:P131+ ?state_ . ?state_ wdt:P31/wdt:P279* wd:Q10864048 .
    ?state_ rdfs:label ?stateLabel_ FILTER(LANG(?stateLabel_) = "en") }
  OPTIONAL { ?item wdt:P17 ?country_ . ?country_ rdfs:label ?countryLabel_ FILTER(LANG(?countryLabel_) = "en") }
  OPTIONAL { ?item wdt:P625 ?coord_ }
  OPTIONAL { ?item wdt:P2025 ?fagc_ }
  OPTIONAL { ?enwiki_ schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?buried wdt:P119 ?item }
}
GROUP BY ?item
ORDER BY ?ordinal
LIMIT ${limit}`;

export function parseSearchRows(rows: SparqlRow[]): CemeterySearchResult[] {
  const seen = new Set<string>();
  const out: CemeterySearchResult[] = [];
  for (const r of rows) {
    const qid = idOf(r.item);
    if (!QID_RE.test(qid) || seen.has(qid)) continue;
    seen.add(qid);
    const locatedIn = pickPlace(r.places);
    const region = [r.state, r.country].find((x) => x && x !== locatedIn) ?? null;
    out.push({
      qid,
      name: r.label ?? qid,
      description: r.description ?? null,
      locatedIn,
      region,
      coord: r.coord ?? null,
      findAGraveCemeteryId: r.fagc ?? null,
      enwiki: r.enwiki ?? null,
      burials: r.burials ? Number(r.burials) : 0,
    });
  }
  return out;
}

/** True when the words already say "cemetery" in some form. */
export function mentionsCemetery(q: string): boolean {
  return /\b(cemetery|cemetary|graveyard|churchyard|burial|memorial park|necropolis|friedhof|cimeti[eè]re|cimitero|cementerio)\b/i.test(q);
}

/** Fewer results than this, and no cemetery word: also search "<q> cemetery". */
export const SEARCH_WIDEN_BELOW = 5;

/** One entity search, filtered to cemeteries, in search order. */
export async function fetchSearchOnce(q: string): Promise<CemeterySearchResult[]> {
  return parseSearchRows(await sparql(searchQuery(q)));
}

/**
 * The plain and the "<q> cemetery" results as one list: one entry per QID
 * (the first seen wins), most people listed first; equal counts keep search
 * order, plain results ahead. At most SEARCH_LIMIT.
 */
export function mergeSearchResults(first: CemeterySearchResult[], second: CemeterySearchResult[]): CemeterySearchResult[] {
  const seen = new Set<string>();
  const merged: CemeterySearchResult[] = [];
  for (const r of [...first, ...second]) {
    if (seen.has(r.qid)) continue;
    seen.add(r.qid);
    merged.push(r);
  }
  // Array.prototype.sort is stable, so ties stay in search order.
  return merged.sort((a, b) => (b.burials || 0) - (a.burials || 0)).slice(0, SEARCH_LIMIT);
}

/**
 * Entity search matches label prefixes, so "oakland" finds the two cemeteries
 * labelled "Oakland…" (West Chester, Pennsylvania first) but not the other 18
 * "Oakland Cemetery" items. When the words don't mention a cemetery and fewer
 * than 5 came back, also search "<q> cemetery", merge, and rank by people
 * listed. At most 2 queries per search. `once` runs a single search: the
 * cached one in the app (lib/data/load.ts), the plain fetch in tests.
 *
 * If the second search fails, the first results still stand; with none, the
 * failure is thrown so the page names it (never "no matches" for an outage).
 */
export async function searchWithFallback(
  q: string,
  once: (q: string) => Promise<CemeterySearchResult[]> = fetchSearchOnce,
): Promise<CemeterySearchResult[]> {
  const first = await once(q);
  if (first.length >= SEARCH_WIDEN_BELOW || mentionsCemetery(q)) return first;
  let second: CemeterySearchResult[];
  try {
    second = await once(`${q} cemetery`);
  } catch (err) {
    if (first.length > 0) return first;
    throw err;
  }
  return mergeSearchResults(first, second);
}

export async function fetchSearch(q: string): Promise<CemeterySearchResult[]> {
  return searchWithFallback(q, fetchSearchOnce);
}
