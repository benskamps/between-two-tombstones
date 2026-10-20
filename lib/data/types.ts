// Lane 2 result shapes built on the shared ones in lib/types.ts.
import type { Cemetery, CemeterySnapshot } from "@/lib/types";
import type { DataSource } from "./errors";

/** A cemetery found near a point. `burials` = people on Wikidata buried there. */
export type NearbyCemetery = Cemetery & {
  distanceKm: number;
  burials: number;
  /** Set when OpenStreetMap also has this cemetery (merged by QID or name). */
  osmId?: string;
};

/** A cemetery mapped on OpenStreetMap that Wikidata doesn't have (so no tour). */
export type OsmOnlyCemetery = {
  osmId: string;
  name: string;
  distanceKm: number;
  lat: number;
  lon: number;
};

export type CemeterySearchResult = Cemetery & {
  burials: number;
  /** State (first-level division) or country, to tell same-named cemeteries apart. */
  region: string | null;
};

export type SourceStatus = { source: DataSource; ok: true } | { source: DataSource; ok: false; message: string };

export type NearResponse = {
  center: { lat: number; lon: number };
  radiusKm: number;
  cemeteries: NearbyCemetery[];
  /** Only present when OpenStreetMap answered. */
  osmOnly: OsmOnlyCemetery[];
  sources: SourceStatus[];
};

export type SearchResponse = {
  query: string;
  results: CemeterySearchResult[];
};

/**
 * A named, non-fatal problem. `code` is for code, `message` for people:
 * - saved-copy: live data failed; this is the committed snapshot.
 * - stories-missing: some Wikipedia batches failed; those people have no story this time.
 * - stories-backfilled: missing stories came from the committed snapshot.
 */
export type TourWarning = {
  source: DataSource;
  code: "saved-copy" | "stories-missing" | "stories-backfilled";
  message: string;
};

/** Where a tour's data came from, for the "saved data from <date>" notice. */
export type SnapshotOrigin = "live" | "saved";

export type BurialsResponse = CemeterySnapshot & {
  origin: SnapshotOrigin;
  /** Named, non-fatal problems (e.g. Wikipedia didn't answer, so stories are missing). */
  warnings: TourWarning[];
};
