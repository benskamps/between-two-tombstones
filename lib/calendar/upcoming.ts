// The /calendar page preview: read the feed the way a calendar app would and
// list the next few events from today. Runs in the browser, so "today" is the
// visitor's own date (all-day events are floating dates, no time zone).

import { compareYMD, daysInMonth, isValidYMD, type YMD } from "../stonemath/index";
import { parseComponents, parseIcsDate, unescapeText, type IcsProperty } from "./ics";
import type { EventKind } from "./kinds";

export type PreviewEvent = {
  uid: string;
  kind: EventKind | null;
  summary: string;
  url: string | null;
  start: YMD;
  /** FREQ=YEARLY with no BYxxx parts: same month and day every year. */
  yearly: boolean;
  /** FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1: the last day of February every year (Feb 29 dates). */
  lastDayOfFebruary: boolean;
};

export type PreviewFeed = { name: string | null; events: PreviewEvent[] };

function prop(props: IcsProperty[], name: string): IcsProperty | undefined {
  return props.find((p) => p.name === name);
}

function rruleParts(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(";")) {
    const [k, v] = part.split("=");
    if (k && v !== undefined) out[k.toUpperCase()] = v.toUpperCase();
  }
  return out;
}

export function readFeed(text: string): PreviewFeed {
  const cal = parseComponents(text, "VCALENDAR")[0];
  const nameProp = cal && prop(cal.properties, "X-WR-CALNAME");
  const events: PreviewEvent[] = [];
  for (const ev of parseComponents(text, "VEVENT")) {
    const p = ev.properties;
    const start = parseIcsDate(prop(p, "DTSTART")?.value ?? "");
    const uid = prop(p, "UID")?.value ?? "";
    if (!start || !isValidYMD(start) || !uid) continue;
    const rr = rruleParts(prop(p, "RRULE")?.value ?? "");
    const isYearly = rr.FREQ === "YEARLY";
    const keys = Object.keys(rr).filter((k) => k !== "FREQ");
    events.push({
      uid,
      kind: /-death@/.test(uid) ? "death" : /-birth@/.test(uid) ? "birth" : null,
      summary: unescapeText(prop(p, "SUMMARY")?.value ?? ""),
      url: prop(p, "URL")?.value ?? null,
      start,
      yearly: isYearly && keys.length === 0,
      lastDayOfFebruary:
        isYearly && rr.BYMONTH === "2" && rr.BYMONTHDAY === "-1" && keys.every((k) => k === "BYMONTH" || k === "BYMONTHDAY"),
    });
  }
  return { name: nameProp ? unescapeText(nameProp.value) : null, events };
}

/** The first date on or after `today` (and not before the event's start) when this event happens, or null. */
export function nextOccurrence(e: PreviewEvent, today: YMD): YMD | null {
  const notBefore = compareYMD(e.start, today) > 0 ? e.start : today;
  if (!e.yearly && !e.lastDayOfFebruary) return compareYMD(e.start, today) >= 0 ? e.start : null;
  // A plain yearly Feb 29 only exists in leap years, so look up to 8 years ahead.
  for (let y = notBefore.y; y <= notBefore.y + 8; y++) {
    const date = e.lastDayOfFebruary ? { y, m: 2, d: daysInMonth(y, 2) } : { y, m: e.start.m, d: e.start.d };
    if (isValidYMD(date) && compareYMD(date, notBefore) >= 0) return date;
  }
  return null;
}

export type Occurrence = { event: PreviewEvent; date: YMD };

/** The next `count` events from today, soonest first; same-day events keep feed order (most famous first). */
export function upcoming(events: PreviewEvent[], today: YMD, count: number): Occurrence[] {
  return events
    .map((event, i) => ({ event, i, date: nextOccurrence(event, today) }))
    .filter((o): o is { event: PreviewEvent; i: number; date: YMD } => o.date !== null)
    .sort((a, b) => compareYMD(a.date, b.date) || a.i - b.i)
    .slice(0, count)
    .map(({ event, date }) => ({ event, date }));
}

/** Today's date where the visitor is. */
export function localToday(now: Date = new Date()): YMD {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

export function ymdKey({ y, m, d }: YMD): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
