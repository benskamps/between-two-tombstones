// SPARQL and Wikipedia responses → Gravitator profiles. Pure functions, tested
// against recorded responses in lib/gravitator/fixtures/.

import { deathYear, needsRespectfulStyle } from "@/lib/respect";
import { parsePoint } from "@/lib/types";
import { CEMETERY, NON_PUBLIC_TYPES } from "./sparql";
import type { GraveyardProfile, NotablePerson } from "./types";

type Binding = Record<string, { type: string; value: string } | undefined>;
export type SparqlJson = { results: { bindings: Binding[] } };

/** A cemetery row from the profiles query, before the public filter. */
export type ProfileRow = Omit<GraveyardProfile, "bio" | "notable"> & {
  /** Non-public classes it belongs to (directly or via subclass), from the query. */
  nonPublic: string[];
  /** Has P576 (dissolved, abolished or demolished date). */
  dissolved: boolean;
};

const QID_RE = /^Q[1-9]\d*$/;

function val(b: Binding, key: string): string | null {
  const v = b[key]?.value;
  return v === undefined || v === "" ? null : v;
}

function qidOf(uri: string | null): string | null {
  const q = uri?.split("/").pop() ?? null;
  return q && QID_RE.test(q) ? q : null;
}

function list(v: string | null): string[] {
  return v ? v.split("|").filter((s) => s.trim() !== "") : [];
}

// ---------------------------------------------------------------------------
// The public filter (hard rule, PLAN.md decision 15)

/** Labels of P31 classes that mean "not open to the public". */
const NON_PUBLIC_LABEL = /\b(family|private|pet|animal|abandoned|former|destroyed|demolished)\b|mass grave/i;
/**
 * Names that say "family/private/pet cemetery" on items typed only as plain
 * "cemetery". Near Atlanta, dozens of Find a Grave imports like "Parker Family
 * Cemetery" carry no class but cemetery; family plots sit on private land.
 */
const NON_PUBLIC_NAME =
  /\b(family|private)\s+(cemetery|cemetary|graveyard|burying ground|burial ground|burial plot|plot|burial site)\b|\b(pet|animal|dog|horse)\s+(cemetery|graveyard|burial ground)\b|\babandoned\b/i;

export type PublicCheck = { public: true } | { public: false; reason: string };

/**
 * Only public places: drops family, private, animal and abandoned cemeteries
 * (by Wikidata class, via subclass), anything with P576, and items whose class
 * label or name says family, private, pet or abandoned.
 */
export function checkPublic(c: {
  name: string;
  typeIds?: string[];
  types?: string[];
  nonPublic?: string[];
  dissolved?: boolean;
}): PublicCheck {
  const byClass = (c.nonPublic ?? []).concat((c.typeIds ?? []).filter((q) => q in NON_PUBLIC_TYPES));
  if (byClass.length > 0) return { public: false, reason: `class ${NON_PUBLIC_TYPES[byClass[0]] ?? byClass[0]}` };
  if (c.dissolved) return { public: false, reason: "dissolved (P576)" };
  const label = (c.types ?? []).find((t) => NON_PUBLIC_LABEL.test(t));
  if (label) return { public: false, reason: `class label "${label}"` };
  if (NON_PUBLIC_NAME.test(c.name)) return { public: false, reason: "name" };
  return { public: true };
}

export function isPublicCemetery(c: Parameters<typeof checkPublic>[0]): boolean {
  return checkPublic(c).public;
}

// ---------------------------------------------------------------------------
// Profiles

const PLACE_ADMIN = /\b(county|parish|borough|township|province|region|district|municipality)\b/i;

/** Prefer a town or city over a county when an item has both. */
export function pickPlace(places: string[]): string | null {
  return places.find((p) => !PLACE_ADMIN.test(p)) ?? places[0] ?? null;
}

/** Commons file → https Special:FilePath at the standard 500 px width (other widths get 429s). */
export function commonsImage(uri: string | null): { url: string; file: string } | null {
  if (!uri) return null;
  const m = uri.match(/Special:FilePath\/(.+)$/);
  if (!m) return null;
  let file: string;
  try {
    file = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const encoded = encodeURIComponent(file.replace(/ /g, "_"));
  return { url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=500`, file };
}

/** P2046 amount + unit item → acres. Unknown units → null (never guess). */
const ACRES_PER_UNIT: Record<string, number> = {
  Q81292: 1, // acre
  Q35852: 2.4710538, // hectare
  Q25343: 0.000247105, // square metre
  Q712226: 247.10538, // square kilometre
  Q232291: 640, // square mile
  Q857027: 0.0000229568, // square foot
};

export function toAcres(amount: string | null, unitUri: string | null): number | null {
  const n = Number(amount);
  const unit = qidOf(unitUri);
  if (!amount || !Number.isFinite(n) || n <= 0 || !unit || !(unit in ACRES_PER_UNIT)) return null;
  const acres = n * ACRES_PER_UNIT[unit];
  return acres >= 10 ? Math.round(acres) : Math.round(acres * 10) / 10;
}

export function parseEstablished(
  time: string | null,
  precision: string | null,
  now = new Date(),
): { year: number; precision: number } | null {
  const m = time?.match(/^([+-]?\d{1,4})-/);
  const p = Number(precision);
  if (!m || !Number.isInteger(p) || p < 7) return null;
  const year = Number(m[1]);
  if (year > now.getUTCFullYear()) return null;
  return { year, precision: Math.min(p, 9) };
}

/** One row of the profiles query → a ProfileRow, or null when it has no usable name or point. */
export function parseProfileRow(b: Binding, now = new Date()): ProfileRow | null {
  const qid = qidOf(val(b, "c"));
  const name = val(b, "name")?.trim() ?? null;
  const point = parsePoint(val(b, "coord"));
  if (!qid || !name || QID_RE.test(name) || !point) return null;
  const pairs = list(val(b, "types")).map((pair) => {
    const i = pair.indexOf("=");
    return { id: i >= 0 ? pair.slice(0, i) : pair, label: i >= 0 ? pair.slice(i + 1) : "" };
  });
  const image = commonsImage(val(b, "image"));
  const distance = Number(val(b, "distance"));
  return {
    qid,
    name,
    place: pickPlace(list(val(b, "places"))),
    lat: point.lat,
    lon: point.lon,
    distanceKm: Number.isFinite(distance) ? distance : 0,
    image: image?.url ?? null,
    imageFile: image?.file ?? null,
    established: parseEstablished(val(b, "inception"), val(b, "inceptionPrecision"), now),
    acres: toAcres(val(b, "area"), val(b, "areaUnit")),
    heritage: list(val(b, "heritage")),
    typeIds: [...new Set(pairs.map((p) => p.id).filter((q) => QID_RE.test(q)))],
    types: [...new Set(pairs.filter((p) => p.id !== CEMETERY && p.label).map((p) => p.label))],
    findAGraveId: val(b, "findAGrave"),
    enwiki: val(b, "enwiki"),
    nonPublic: Object.keys(NON_PUBLIC_TYPES).filter((q) => val(b, `not_${q}`) === "true"),
    dissolved: val(b, "dissolved") === "true",
  };
}

/** All rows → public profiles (deduplicated by QID) plus how many were left out. */
export function parseProfiles(json: SparqlJson, now = new Date()): { rows: ProfileRow[]; excluded: number } {
  const seen = new Map<string, ProfileRow>();
  let excluded = 0;
  for (const b of json.results.bindings) {
    const row = parseProfileRow(b, now);
    if (!row || seen.has(row.qid)) continue;
    if (!isPublicCemetery(row)) {
      excluded++;
      continue;
    }
    seen.set(row.qid, row);
  }
  return { rows: [...seen.values()], excluded };
}

// ---------------------------------------------------------------------------
// Notable burials

export const TOP_PEOPLE = 3;

/** Burials rows → per cemetery: how many people, and the top 3 by sitelinks. */
export function parseBurials(
  json: SparqlJson,
  now = new Date(),
): Map<string, { count: number; top: NotablePerson[] }> {
  const byCemetery = new Map<string, Map<string, { name: string; sitelinks: number; death: string | null }>>();
  for (const b of json.results.bindings) {
    const c = qidOf(val(b, "c"));
    const p = qidOf(val(b, "p"));
    const name = val(b, "pLabel");
    if (!c || !p || !name || QID_RE.test(name)) continue;
    const sitelinks = Number(val(b, "sitelinks")) || 0;
    const people = byCemetery.get(c) ?? new Map();
    byCemetery.set(c, people);
    const prev = people.get(p);
    // A person with two equal-rank death dates comes back twice; keep the first date.
    people.set(p, { name, sitelinks: Math.max(sitelinks, prev?.sitelinks ?? 0), death: prev?.death ?? val(b, "death") });
  }
  const out = new Map<string, { count: number; top: NotablePerson[] }>();
  for (const [c, people] of byCemetery) {
    const top = [...people.entries()]
      .sort(([qa, a], [qb, b]) => b.sitelinks - a.sitelinks || a.name.localeCompare(b.name) || qa.localeCompare(qb))
      .slice(0, TOP_PEOPLE)
      .map(([qid, p]) => ({
        qid,
        name: p.name,
        deathYear: deathYear({ death: p.death }),
        recent: needsRespectfulStyle({ death: p.death }, now),
      }));
    out.set(c, { count: people.size, top });
  }
  return out;
}

/** Most notable burials first, then nearest. */
export function compareProfiles(
  a: { notable: { count: number } | null; distanceKm: number; name: string },
  b: { notable: { count: number } | null; distanceKm: number; name: string },
): number {
  return (
    (b.notable?.count ?? 0) - (a.notable?.count ?? 0) || a.distanceKm - b.distanceKm || a.name.localeCompare(b.name)
  );
}

// ---------------------------------------------------------------------------
// Wikipedia intros

export type ExtractsJson = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; extract?: string; missing?: boolean }[];
  };
};

const MAX_INTRO = 1500;

/** Tidy a plain-text intro: collapse blank lines, cap the length at a sentence end. */
export function tidyIntro(text: string): string {
  const t = text.replace(/\s*\n+\s*/g, "\n\n").trim();
  if (t.length <= MAX_INTRO) return t;
  const cut = t.slice(0, MAX_INTRO);
  const end = cut.lastIndexOf(". ");
  return end > 200 ? cut.slice(0, end + 1) : cut.trimEnd() + "…";
}

export function wikipediaUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Batched extracts → requested title → { intro, url }, following normalization and redirects. */
export function parseExtracts(json: ExtractsJson, requested: string[]): Map<string, { intro: string; url: string }> {
  const q = json.query ?? {};
  const follow = new Map<string, string>();
  for (const n of q.normalized ?? []) follow.set(n.from, n.to);
  for (const r of q.redirects ?? []) follow.set(r.from, r.to);
  const pages = new Map((q.pages ?? []).filter((p) => !p.missing && p.extract).map((p) => [p.title, p]));
  const out = new Map<string, { intro: string; url: string }>();
  for (const title of requested) {
    let t = title;
    for (let hops = 0; hops < 3 && follow.has(t); hops++) t = follow.get(t)!;
    const page = pages.get(t);
    const intro = page?.extract ? tidyIntro(page.extract) : "";
    if (page && intro) out.set(title, { intro, url: wikipediaUrl(page.title) });
  }
  return out;
}
