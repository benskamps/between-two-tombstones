// The Haunted Calendar feed: a cemetery's burials → one yearly all-day event
// per person and kind (death-day, optionally birthday).
//
// Who gets in (PLAN.md decision 5, respect rules):
// - Only people for whom needsRespectfulStyle() is false, i.e. we know they
//   died at least 25 years ago. A recent or unknown death never goes into
//   anyone's calendar.
// - Only dates with day precision (Wikidata precision 11). Wikidata stores a
//   year-only date as Jan 1, which would put a false anniversary on New Year's.
// - The `limit` most famous people (Wikimedia sitelinks, most first; ties by
//   QID so the order never shuffles between fetches).
//
// Feb 29: a leap-day date gets RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1,
// "the last day of February every year", so it lands on Feb 29 in leap years
// and Feb 28 otherwise. A plain FREQ=YEARLY from Feb 29 would show up only once
// every four years (RFC 5545 drops invalid dates), and Mar 1 would move the
// anniversary out of the person's month. Feb 28 keeps it in February, on the
// last day that February has.

import { needsRespectfulStyle } from "../respect";
import { SITE } from "../site";
import { parseIsoDate, type YMD } from "../stonemath/index";
import { parsePoint, type Cemetery, type CemeterySnapshot, type Person } from "../types";
import { escapeText, formatDate, formatUtcDateTime, serializeLines } from "./ics";
import { EVENT_KINDS, type EventKind } from "./kinds";

export { DEFAULT_KINDS, DEFAULT_LIMIT, EVENT_KINDS, MAX_LIMIT, type EventKind } from "./kinds";

/** Wikidata time precision for a full date. */
export const DAY_PRECISION = 11;

export const PRODID = "-//Between Two Tombstones//Haunted Calendar//EN";
export const UID_DOMAIN = "between-two-tombstones";
/** RRULE for a Feb 29 date: the last day of February, every year. */
export const LEAP_DAY_RRULE = "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1";
export const YEARLY_RRULE = "FREQ=YEARLY";

export type FeedOptions = {
  kinds: readonly EventKind[];
  limit: number;
  /** Decides who died 25+ years ago. */
  now: Date;
  /** Origin for the story links. Defaults to SITE.url. */
  siteUrl?: string;
};

export type CalendarEvent = {
  uid: string;
  kind: EventKind;
  personQid: string;
  name: string;
  date: YMD;
  rrule: string;
  summary: string;
  description: string;
  url: string;
};

/** A date we can put on a calendar: only with day precision, only a real calendar date. */
export function dayPrecisionDate(iso: string | null, precision: number | null): YMD | null {
  if (precision !== DAY_PRECISION) return null;
  return parseIsoDate(iso);
}

function eventDate(person: Person, kind: EventKind): YMD | null {
  return kind === "death"
    ? dayPrecisionDate(person.death, person.deathPrecision)
    : dayPrecisionDate(person.birth, person.birthPrecision);
}

/** Wikidata falls back to the bare QID when an item has no English label; the Wikipedia title reads better. */
export function personName(person: Pick<Person, "qid" | "name" | "wikipedia">): string {
  const name = person.name?.trim();
  if (name && !/^Q\d+$/.test(name)) return name;
  return person.wikipedia?.title?.trim() || name || person.qid;
}

function qidNumber(qid: string): number {
  return Number(qid.replace(/^Q/, "")) || 0;
}

/** Most famous first; ties broken by QID so the feed is stable. */
export function byFame(a: Pick<Person, "qid" | "sitelinks">, b: Pick<Person, "qid" | "sitelinks">): number {
  return (b.sitelinks ?? 0) - (a.sitelinks ?? 0) || qidNumber(a.qid) - qidNumber(b.qid);
}

/**
 * The people who go into the feed, in feed order: died 25+ years ago, with at
 * least one day-precision date of a requested kind, most famous first, capped
 * at `limit`.
 */
export function selectPeople(
  people: Person[],
  { kinds, limit, now }: Pick<FeedOptions, "kinds" | "limit" | "now">,
): Person[] {
  const seen = new Set<string>();
  return people
    .filter((p) => {
      if (!p?.qid || seen.has(p.qid)) return false;
      seen.add(p.qid);
      if (needsRespectfulStyle(p, now)) return false;
      return kinds.some((k) => eventDate(p, k) !== null);
    })
    .sort(byFame)
    .slice(0, limit);
}

export function summaryFor(kind: EventKind, name: string, year: number): string {
  return kind === "death" ? `${name} died on this day in ${year}` : `${name} was born on this day in ${year}`;
}

/** "Oakland Cemetery, Atlanta": the name plus the place it's in, when we know it. */
export function cemeteryLabel(cemetery: Pick<Cemetery, "name" | "locatedIn">): string {
  const place = cemetery.locatedIn?.trim();
  return place ? `${cemetery.name}, ${place}` : cemetery.name;
}

export function calendarName(cemetery: Pick<Cemetery, "name">): string {
  return `Haunted: ${cemetery.name}`;
}

/** File name for the .ics download: "oakland-cemetery-atlanta". ASCII only (it goes in a header). */
export function cemeterySlug(cemetery: Pick<Cemetery, "qid" | "name" | "locatedIn">): string {
  const place = cemetery.locatedIn?.trim();
  const base = place && !cemetery.name.toLowerCase().includes(place.toLowerCase()) ? `${cemetery.name} ${place}` : cemetery.name;
  const slug = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || cemetery.qid.toLowerCase();
}

export function storyUrl(cemeteryQid: string, personQid: string, siteUrl: string = SITE.url): string {
  return new URL(`/cemetery/${cemeteryQid}#${personQid}`, siteUrl).toString();
}

// Words that end in a period without ending a sentence ("Jr.", "U.S.", "c. 1847").
const ABBREVIATIONS = new Set(
  (
    "jr sr st dr mr mrs ms mt ft gen col capt lt sgt maj adm gov sen rep rev hon prof pres " +
    "co corp inc ltd bros no nos vs ca c approx est jan feb mar apr jun jul aug sep sept oct nov dec " +
    "e.g i.e etc al op ed vol pp fl"
  ).split(" "),
);

/** Index just past the end of the first sentence, or -1 when the text is one sentence. */
function firstSentenceEnd(text: string, from = 0): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "(" || c === "[") depth += 1;
    else if ((c === ")" || c === "]") && depth > 0) depth -= 1;
    else if ((c === "." || c === "!" || c === "?") && depth === 0) {
      let j = i + 1;
      while (j < text.length && /["'”’)]/.test(text[j])) j += 1;
      if (j >= text.length) return -1;
      if (!/\s/.test(text[j])) continue;
      let k = j;
      while (k < text.length && /\s/.test(text[k])) k += 1;
      if (k >= text.length) return -1;
      if (!/[A-Z0-9"“‘'(]/.test(text[k])) continue;
      if (c === ".") {
        // The whole word before the period: "1960s." is a word ending in "s", not the initial "s.".
        const word = text.slice(0, i).match(/(?:^|[^A-Za-z0-9.])([A-Za-z][A-Za-z.]*)$/)?.[1] ?? "";
        const bare = word.toLowerCase().replace(/^\.+/, "");
        // Initials ("W. E. B."), dotted abbreviations ("U.S."), known short words.
        if (/^[A-Za-z]$/.test(word) || /^([A-Za-z]\.)+[A-Za-z]$/.test(word) || ABBREVIATIONS.has(bare)) continue;
      }
      return j;
    }
  }
  return -1;
}

/**
 * One or two plain sentences from a Wikipedia intro: the first sentence, plus
 * the second when both together stay short. Long first sentences are cut at a
 * word boundary with an ellipsis.
 */
export function excerpt(extract: string | null | undefined, maxChars = 320): string {
  const text = (extract ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const end1 = firstSentenceEnd(text);
  let out = end1 === -1 ? text : text.slice(0, end1).trim();
  if (end1 !== -1) {
    const end2 = firstSentenceEnd(text, end1);
    const two = (end2 === -1 ? text : text.slice(0, end2)).trim();
    if (two.length <= maxChars) out = two;
  }
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars - 1);
    const space = cut.lastIndexOf(" ");
    out = `${(space > maxChars / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}…`;
  }
  return out;
}

export function descriptionFor(person: Person, cemetery: Cemetery, url: string): string {
  const parts: string[] = [];
  const wiki = person.wikipedia;
  const story = excerpt(wiki?.extract);
  if (story) parts.push(story);
  else if (person.description) parts.push(`${person.description[0].toUpperCase()}${person.description.slice(1)}.`);
  parts.push(`Buried at ${cemeteryLabel(cemetery)}.`);
  parts.push(`Story: ${url}`);
  if (story && wiki) parts.push(`From Wikipedia, CC BY-SA 4.0: ${wiki.url}`);
  return parts.join("\n");
}

/** The events in feed order: by person (most famous first), death-day before birthday. */
export function buildEvents(snapshot: CemeterySnapshot, options: FeedOptions): CalendarEvent[] {
  const { cemetery } = snapshot;
  const events: CalendarEvent[] = [];
  for (const person of selectPeople(snapshot.people, options)) {
    const name = personName(person);
    const url = storyUrl(cemetery.qid, person.qid, options.siteUrl);
    for (const kind of EVENT_KINDS) {
      if (!options.kinds.includes(kind)) continue;
      const date = eventDate(person, kind);
      if (!date) continue;
      events.push({
        uid: `${person.qid}-${kind}@${UID_DOMAIN}`,
        kind,
        personQid: person.qid,
        name,
        date,
        rrule: date.m === 2 && date.d === 29 ? LEAP_DAY_RRULE : YEARLY_RRULE,
        summary: summaryFor(kind, name, date.y),
        description: descriptionFor(person, cemetery, url),
        url,
      });
    }
  }
  return events;
}

export function calendarDescription(cemetery: Cemetery, kinds: readonly EventKind[], people: number): string {
  const what =
    kinds.includes("death") && kinds.includes("birth")
      ? "death-days and birthdays"
      : kinds.includes("birth")
        ? "birthdays"
        : "death-days";
  return (
    `The ${what} of ${people} ${people === 1 ? "person" : "people"} buried at ${cemeteryLabel(cemetery)}, ` +
    `on your calendar every year. Only people who died at least 25 years ago are included. ` +
    `Each event links to their story on ${SITE.name}. Remove this calendar to remove every event.`
  );
}

/** When this copy of the burials was fetched; falls back to now. Used as DTSTAMP so the same data gives the same feed. */
function stampFor(snapshot: CemeterySnapshot, now: Date): Date {
  const t = Date.parse(snapshot.fetchedAt);
  return Number.isFinite(t) && t <= now.getTime() ? new Date(t) : now;
}

/** The whole iCalendar object, folded and CRLF-terminated. */
export function buildCalendar(snapshot: CemeterySnapshot, options: FeedOptions): string {
  const { cemetery } = snapshot;
  const events = buildEvents(snapshot, options);
  const people = new Set(events.map((e) => e.personQid)).size;
  const stamp = formatUtcDateTime(stampFor(snapshot, options.now));
  const point = parsePoint(cemetery.coord);
  const location = escapeText(cemeteryLabel(cemetery));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName(cemetery))}`,
    `X-WR-CALDESC:${escapeText(calendarDescription(cemetery, options.kinds, people))}`,
    "REFRESH-INTERVAL;VALUE=DURATION:P1D",
    "X-PUBLISHED-TTL:P1D",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatDate(e.date)}`,
      `RRULE:${e.rrule}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      `URL:${e.url}`,
      `LOCATION:${location}`,
    );
    if (point) lines.push(`GEO:${round6(point.lat)};${round6(point.lon)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return serializeLines(lines);
}

function round6(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}
