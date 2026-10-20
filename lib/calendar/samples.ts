// The cemeteries the /calendar page offers, reduced to what the page shows.
// Server-only (it reads the bundled snapshots); only these small objects reach
// the browser.

import { calendarName, cemeteryLabel, cemeterySlug } from "./feed";
import { BUNDLED_SNAPSHOTS } from "./source";

export type CalendarSample = {
  qid: string;
  name: string;
  /** For the picker: "Atlanta, Georgia". */
  place: string;
  /** As the feed says it: "Oakland Cemetery, Atlanta". */
  label: string;
  /** X-WR-CALNAME, also the name Outlook shows: "Haunted: Oakland Cemetery". */
  calendarName: string;
  /** Download file name without ".ics". */
  slug: string;
};

const PLACES: Record<string, string> = {
  Q2008469: "Atlanta, Georgia",
  Q360779: "Sleepy Hollow, New York",
};

export const CALENDAR_SAMPLES: CalendarSample[] = BUNDLED_SNAPSHOTS.map(({ cemetery }) => ({
  qid: cemetery.qid,
  name: cemetery.name,
  place: PLACES[cemetery.qid] ?? cemetery.locatedIn ?? "",
  label: cemeteryLabel(cemetery),
  calendarName: calendarName(cemetery),
  slug: cemeterySlug(cemetery),
}));
