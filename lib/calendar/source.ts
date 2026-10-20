// Where the calendar feed gets a cemetery's burials.
//
// For now: the two snapshots bundled with the app (Oakland, Atlanta and Sleepy
// Hollow). Any other cemetery is a CalendarNotAvailableError → 404.
//
// LANE 2 SWAP: when the live burials loader lands (lib/data/**, the same
// CemeterySnapshot that GET /api/cemeteries/[qid]/burials returns), point
// `burialsSource` at it. That is the one line to change; see the bottom of
// this file.

import oakland from "../../data/snapshots/oakland-atlanta.json";
import sleepyHollow from "../../data/snapshots/sleepy-hollow.json";
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

// LANE 2 SWAP: replace `snapshotSource` with Lane 2's live loader, e.g.
//   export const burialsSource: BurialsSource = loadBurials;
export const burialsSource: BurialsSource = snapshotSource;
