// Where the calendar feed gets a cemetery's burials.
//
// The tour's live loader (lib/data/load.ts), the same CemeterySnapshot that
// GET /api/cemeteries/[qid]/burials returns. `snapshotSource` (the two bundled
// cemeteries) stays for tests and as a fallback reference.

import oakland from "../../data/snapshots/oakland-atlanta.json";
import sleepyHollow from "../../data/snapshots/sleepy-hollow.json";
import { loadCemetery } from "../data/load";
import type { CemeterySnapshot } from "../types";

export type BurialsSource = (qid: string) => Promise<CemeterySnapshot>;

export const NOT_AVAILABLE_MESSAGE = "This cemetery isn't available for calendars yet.";

/** Thrown by a source when it has nothing for this cemetery; the route answers 404. */
export class CalendarNotAvailableError extends Error {
  constructor(message = NOT_AVAILABLE_MESSAGE) {
    super(message);
    this.name = "CalendarNotAvailableError";
  }
}

export const BUNDLED_SNAPSHOTS: readonly CemeterySnapshot[] = [
  oakland as CemeterySnapshot,
  sleepyHollow as CemeterySnapshot,
];

export const snapshotSource: BurialsSource = async (qid) => {
  const snapshot = BUNDLED_SNAPSHOTS.find((s) => s.cemetery.qid === qid);
  if (!snapshot) throw new CalendarNotAvailableError();
  return snapshot;
};

/**
 * Live burials from the tour's data layer (lib/data). For the two samples it
 * already falls back to the saved copy when Wikidata is down. Failures become a
 * plain `{ source, message, status }` the calendar route passes through.
 */
export const liveSource: BurialsSource = async (qid) => {
  const result = await loadCemetery(qid);
  // Not a cemetery Wikidata knows, or a place with no recorded burials: nothing to haunt with.
  if (result.status === "ok" && result.data.people.length > 0) return result.data;
  if (result.status !== "error") throw new CalendarNotAvailableError();
  throw { source: result.error.source, message: result.error.userMessage, status: result.error.httpStatus };
};

export const burialsSource: BurialsSource = liveSource;
