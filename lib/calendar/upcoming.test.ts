import { describe, expect, it } from "vitest";
import oakland from "../../data/snapshots/oakland-atlanta.json";
import type { CemeterySnapshot, Person } from "../types";
import { buildCalendar } from "./feed";
import { localToday, nextOccurrence, readFeed, upcoming, ymdKey, type PreviewEvent } from "./upcoming";

const NOW = new Date("2026-10-20T12:00:00Z");

function ev(over: Partial<PreviewEvent>): PreviewEvent {
  return {
    uid: "Q1-death@between-two-tombstones",
    kind: "death",
    summary: "x",
    url: null,
    start: { y: 1900, m: 6, d: 15 },
    yearly: true,
    lastDayOfFebruary: false,
    ...over,
  };
}

describe("nextOccurrence", () => {
  it("is this year's date when it's still ahead (or today), else next year's", () => {
    const e = ev({ start: { y: 1949, m: 8, d: 16 } });
    expect(nextOccurrence(e, { y: 2026, m: 8, d: 16 })).toEqual({ y: 2026, m: 8, d: 16 });
    expect(nextOccurrence(e, { y: 2026, m: 8, d: 17 })).toEqual({ y: 2027, m: 8, d: 16 });
  });

  it("puts a Feb 29 death on Feb 28 in common years and Feb 29 in leap years", () => {
    const leap = ev({ start: { y: 1904, m: 2, d: 29 }, yearly: false, lastDayOfFebruary: true });
    expect(nextOccurrence(leap, { y: 2027, m: 1, d: 1 })).toEqual({ y: 2027, m: 2, d: 28 });
    expect(nextOccurrence(leap, { y: 2028, m: 1, d: 1 })).toEqual({ y: 2028, m: 2, d: 29 });
    expect(nextOccurrence(leap, { y: 2027, m: 3, d: 1 })).toEqual({ y: 2028, m: 2, d: 29 });
    expect(nextOccurrence(leap, { y: 2100, m: 2, d: 1 })).toEqual({ y: 2100, m: 2, d: 28 }); // 2100 isn't a leap year
  });

  it("follows plain FREQ=YEARLY from Feb 29 to leap years only, as RFC 5545 says", () => {
    const plain = ev({ start: { y: 1904, m: 2, d: 29 } });
    expect(nextOccurrence(plain, { y: 2027, m: 1, d: 1 })).toEqual({ y: 2028, m: 2, d: 29 });
  });

  it("doesn't recur before the start, and a one-off only happens once", () => {
    expect(nextOccurrence(ev({ start: { y: 2030, m: 1, d: 5 } }), { y: 2026, m: 10, d: 20 })).toEqual({ y: 2030, m: 1, d: 5 });
    expect(nextOccurrence(ev({ yearly: false, start: { y: 2020, m: 1, d: 1 } }), { y: 2026, m: 10, d: 20 })).toBeNull();
  });
});

describe("the page preview", () => {
  it("reads the real feed and lists the next five from today, soonest first", () => {
    const text = buildCalendar(oakland as CemeterySnapshot, { kinds: ["death"], limit: 30, now: NOW, siteUrl: "https://x.test" });
    const feed = readFeed(text);
    expect(feed.name).toBe("Haunted: Oakland Cemetery");
    expect(feed.events).toHaveLength(30);
    expect(feed.events.every((e) => e.kind === "death" && e.yearly)).toBe(true);
    const next = upcoming(feed.events, { y: 2026, m: 10, d: 20 }, 5);
    expect(next).toHaveLength(5);
    const keys = next.map((o) => ymdKey(o.date));
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every((k) => k >= "2026-10-20" && k < "2027-10-20")).toBe(true);
    // Mitchell died Aug 16: from Oct 20, her next death-day is in 2027, not before any October/November ones.
    const mitchell = feed.events.find((e) => e.uid === "Q173540-death@between-two-tombstones")!;
    expect(nextOccurrence(mitchell, { y: 2026, m: 10, d: 20 })).toEqual({ y: 2027, m: 8, d: 16 });
    expect(mitchell.summary).toBe("Margaret Mitchell died on this day in 1949");
    expect(mitchell.url).toBe("https://x.test/cemetery/Q2008469#Q173540");
  });

  it("reads the Feb 29 rule from a generated feed", () => {
    const p = (oakland as CemeterySnapshot).people[0] as Person;
    const snap: CemeterySnapshot = {
      ...(oakland as CemeterySnapshot),
      people: [{ ...p, qid: "Q4115189", name: "Leap Day Test", death: "1904-02-29T00:00:00Z", deathPrecision: 11 }],
    };
    const feed = readFeed(buildCalendar(snap, { kinds: ["death"], limit: 30, now: NOW }));
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0].lastDayOfFebruary).toBe(true);
    expect(upcoming(feed.events, { y: 2027, m: 2, d: 1 }, 5)[0].date).toEqual({ y: 2027, m: 2, d: 28 });
  });

  it("gives today's date in the visitor's own calendar", () => {
    const d = new Date(2026, 9, 20, 23, 30);
    expect(localToday(d)).toEqual({ y: 2026, m: 10, d: 20 });
  });
});
