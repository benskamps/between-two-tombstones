// Shared shapes. The offline snapshots in data/snapshots/ use exactly these, and
// the /api/cemeteries routes return them, so every lane can build against either.

export type WikipediaSummary = {
  title: string;
  extract: string;
  url: string;
  revision?: number;
};

export type Person = {
  qid: string;
  name: string;
  description: string | null;
  /** ISO timestamp from Wikidata, e.g. "1783-04-03T00:00:00Z". */
  birth: string | null;
  /** Wikidata time precision: 11 = day, 10 = month, 9 = year. */
  birthPrecision: number | null;
  death: string | null;
  deathPrecision: number | null;
  causesOfDeath: string[];
  mannersOfDeath: string[];
  occupations: string[];
  /** Commons Special:FilePath URL. */
  image: string | null;
  graveImage: string | null;
  /** WKT "Point(lon lat)" when the grave location is known. */
  graveCoord: string | null;
  findAGraveId: string | null;
  /** Number of Wikimedia sitelinks; the fame signal. */
  sitelinks: number;
  wikipedia: WikipediaSummary | null;
};

export type Cemetery = {
  qid: string;
  name: string;
  description: string | null;
  locatedIn: string | null;
  coord: string | null;
  findAGraveCemeteryId: string | null;
  enwiki: string | null;
};

export type CemeterySnapshot = {
  cemetery: Cemetery;
  fetchedAt: string;
  sources: Record<string, { license: string; note?: string; query?: string }>;
  people: Person[];
};

/** Parse a WKT "Point(lon lat)" into { lat, lon }, or null. */
export function parsePoint(wkt: string | null): { lat: number; lon: number } | null {
  const m = wkt?.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  return m ? { lon: Number(m[1]), lat: Number(m[2]) } : null;
}
