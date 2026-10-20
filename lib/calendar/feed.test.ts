import { describe, expect, it } from "vitest";
import oakland from "../../data/snapshots/oakland-atlanta.json";
import sleepyHollow from "../../data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot, Person } from "../types";
import {
  LEAP_DAY_RRULE,
  buildCalendar,
  buildEvents,
  cemeteryLabel,
  cemeterySlug,
  excerpt,
  personName,
  selectPeople,
  summaryFor,
  type FeedOptions,
} from "./feed";

const NOW = new Date("2026-10-20T12:00:00Z");
const SITE_URL = "https://between-two-tombstones.vercel.app";
const OAKLAND = oakland as CemeterySnapshot;
const SLEEPY = sleepyHollow as CemeterySnapshot;

function opts(over: Partial<FeedOptions> = {}): FeedOptions {
  return { kinds: ["death"], limit: 30, now: NOW, siteUrl: SITE_URL, ...over };
}

function person(over: Partial<Person> & { qid: string }): Person {
  return {
    name: `Person ${over.qid}`,
    description: null,
    birth: "1850-03-10T00:00:00Z",
    birthPrecision: 11,
    death: "1900-06-15T00:00:00Z",
    deathPrecision: 11,
    causesOfDeath: [],
    mannersOfDeath: [],
    occupations: [],
    image: null,
    graveImage: null,
    graveCoord: null,
    findAGraveId: null,
    sitelinks: 1,
    wikipedia: null,
    ...over,
  };
}

function snapshot(people: Person[]): CemeterySnapshot {
  return {
    cemetery: {
      qid: "Q999",
      name: "Test Cemetery",
      description: null,
      locatedIn: "Testville",
      coord: "Point(-84.371333 33.748722)",
      findAGraveCemeteryId: null,
      enwiki: null,
    },
    fetchedAt: "2026-10-20T02:41:03.479Z",
    sources: {},
    people,
  };
}

// ---------------------------------------------------------------------------
// A tiny, independent iCalendar reader for these tests: unfold, then split
// each line into name, params and value. Deliberately not lib/calendar/ics.ts.

type Prop = { name: string; params: string[]; value: string };
type Parsed = { calendar: Prop[]; events: Prop[][] };

function tinyParse(text: string): Parsed {
  expect(text.endsWith("\r\n")).toBe(true);
  expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/); // CRLF only
  const lines = text.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
  const out: Parsed = { calendar: [], events: [] };
  let event: Prop[] | null = null;
  for (const line of lines) {
    const colon = line.indexOf(":");
    expect(colon, line).toBeGreaterThan(0);
    const [name, ...params] = line.slice(0, colon).split(";");
    const prop = { name, params, value: line.slice(colon + 1) };
    if (name === "BEGIN" && prop.value === "VEVENT") event = [];
    else if (name === "END" && prop.value === "VEVENT") {
      out.events.push(event!);
      event = null;
    } else if (event) event.push(prop);
    else if (name !== "BEGIN" && name !== "END") out.calendar.push(prop);
  }
  return out;
}

function get(props: Prop[], name: string): string | undefined {
  return props.find((p) => p.name === name)?.value;
}

function unescape(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c.toLowerCase() === "n" ? "\n" : c));
}

// ---------------------------------------------------------------------------

describe("summary wording", () => {
  it("says who died or was born on this day, and the year", () => {
    expect(summaryFor("death", "Margaret Mitchell", 1949)).toBe("Margaret Mitchell died on this day in 1949");
    expect(summaryFor("birth", "Washington Irving", 1783)).toBe("Washington Irving was born on this day in 1783");
  });

  it("uses the real data for the two examples", () => {
    const mitchell = buildEvents(OAKLAND, opts()).find((e) => e.personQid === "Q173540");
    expect(mitchell?.summary).toBe("Margaret Mitchell died on this day in 1949");
    const irving = buildEvents(SLEEPY, opts({ kinds: ["death", "birth"] })).find(
      (e) => e.name === "Washington Irving" && e.kind === "birth",
    );
    expect(irving?.summary).toBe("Washington Irving was born on this day in 1783");
    expect(irving?.date).toEqual({ y: 1783, m: 4, d: 3 });
  });

  it("falls back to the Wikipedia title when Wikidata has no English label", () => {
    expect(
      personName({ qid: "Q6066179", name: "Q6066179", wikipedia: { title: "Ira O. McDaniel", extract: "", url: "" } }),
    ).toBe("Ira O. McDaniel");
    expect(personName({ qid: "Q1", name: "Ada", wikipedia: null })).toBe("Ada");
  });
});

describe("who gets in", () => {
  it("excludes everyone who died less than 25 years ago, and unknown deaths", () => {
    const people = [
      person({ qid: "Q1", death: "2001-05-01T00:00:00Z" }), // 25 years by year: in
      person({ qid: "Q2", death: "2002-05-01T00:00:00Z" }), // 24: out
      person({ qid: "Q3", death: "2019-03-02T00:00:00Z" }), // out
      person({ qid: "Q4", death: null, deathPrecision: null }), // unknown: out, birthday too
    ];
    const both = buildEvents(snapshot(people), opts({ kinds: ["death", "birth"] }));
    expect([...new Set(both.map((e) => e.personQid))]).toEqual(["Q1"]);
  });

  it("never includes the recent deaths in the real snapshots", () => {
    const recent = ["Leona Helmsley", "Brooke Astor", "Ogden R. Reid", "Peter A. Peyser", "Maynard Jackson", "Ivan Allen, Jr."];
    for (const snap of [OAKLAND, SLEEPY]) {
      const events = buildEvents(snap, opts({ kinds: ["death", "birth"], limit: 80 }));
      expect(events.length).toBeGreaterThan(50);
      for (const e of events) {
        expect(recent).not.toContain(e.name);
        const p = snap.people.find((x) => x.qid === e.personQid)!;
        expect(Number(p.death!.slice(0, 4))).toBeLessThanOrEqual(2001);
      }
    }
  });

  it("uses only day-precision dates (year-only dates are stored as Jan 1)", () => {
    const people = [
      person({ qid: "Q10", death: "1901-01-01T00:00:00Z", deathPrecision: 9, birthPrecision: 11 }),
      person({ qid: "Q11", death: "1902-05-00T00:00:00Z", deathPrecision: 10, birthPrecision: 9 }),
      person({ qid: "Q12", deathPrecision: 11, birthPrecision: 10 }),
    ];
    const deaths = buildEvents(snapshot(people), opts());
    expect(deaths.map((e) => e.uid)).toEqual(["Q12-death@between-two-tombstones"]);
    const both = buildEvents(snapshot(people), opts({ kinds: ["death", "birth"] }));
    // Q10's birthday is a full date, so they come in for the birthday only.
    expect(both.map((e) => e.uid).sort()).toEqual(
      ["Q10-birth@between-two-tombstones", "Q12-death@between-two-tombstones"].sort(),
    );
  });

  it("orders by fame and caps at the limit (people, not events)", () => {
    const people = [
      person({ qid: "Q30", sitelinks: 5 }),
      person({ qid: "Q31", sitelinks: 50 }),
      person({ qid: "Q32", sitelinks: 5 }),
      person({ qid: "Q33", sitelinks: 9 }),
    ];
    expect(selectPeople(people, { kinds: ["death"], limit: 3, now: NOW }).map((p) => p.qid)).toEqual([
      "Q31",
      "Q33",
      "Q30",
    ]);
    const events = buildEvents(snapshot(people), opts({ kinds: ["death", "birth"], limit: 2 }));
    expect(events.map((e) => e.uid)).toEqual([
      "Q31-death@between-two-tombstones",
      "Q31-birth@between-two-tombstones",
      "Q33-death@between-two-tombstones",
      "Q33-birth@between-two-tombstones",
    ]);
  });
});

describe("Feb 29", () => {
  it("recurs on the last day of February, so non-leap years get Feb 28", () => {
    const people = [person({ qid: "Q40", death: "1904-02-29T00:00:00Z", birth: "1880-02-28T00:00:00Z" })];
    const [death, birth] = buildEvents(snapshot(people), opts({ kinds: ["death", "birth"] }));
    expect(death.rrule).toBe(LEAP_DAY_RRULE);
    expect(death.rrule).toBe("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
    expect(death.date).toEqual({ y: 1904, m: 2, d: 29 });
    expect(birth.rrule).toBe("FREQ=YEARLY"); // Feb 28 stays a plain yearly date

    const ics = tinyParse(buildCalendar(snapshot(people), opts()));
    expect(get(ics.events[0], "DTSTART")).toBe("19040229");
    expect(ics.events[0].find((p) => p.name === "DTSTART")?.params).toEqual(["VALUE=DATE"]);
    expect(get(ics.events[0], "RRULE")).toBe("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
  });
});

describe("stable UIDs", () => {
  it("are <person qid>-<kind>@between-two-tombstones and don't change between builds", () => {
    const a = buildEvents(OAKLAND, opts({ kinds: ["death", "birth"] }));
    const b = buildEvents(OAKLAND, opts({ kinds: ["death", "birth"], now: new Date("2027-01-02T00:00:00Z") }));
    for (const e of a) expect(e.uid).toMatch(/^Q\d+-(death|birth)@between-two-tombstones$/);
    expect(new Set(a.map((e) => e.uid)).size).toBe(a.length);
    const bUids = new Set(b.map((e) => e.uid));
    for (const e of a) expect(bUids.has(e.uid)).toBe(true);
    expect(a.find((e) => e.personQid === "Q173540")?.uid).toBe("Q173540-death@between-two-tombstones");
  });

  it("gives the same bytes for the same data and year", () => {
    expect(buildCalendar(SLEEPY, opts())).toBe(buildCalendar(SLEEPY, opts({ now: new Date("2026-12-31T23:00:00Z") })));
  });
});

describe("the whole feed", () => {
  const text = buildCalendar(OAKLAND, opts({ kinds: ["death", "birth"] }));
  const ics = tinyParse(text);

  it("is CRLF-only, folded to 75 octets, and parses", () => {
    for (const line of text.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("has the calendar properties", () => {
    expect(get(ics.calendar, "VERSION")).toBe("2.0");
    expect(get(ics.calendar, "PRODID")).toBe("-//Between Two Tombstones//Haunted Calendar//EN");
    expect(get(ics.calendar, "CALSCALE")).toBe("GREGORIAN");
    expect(get(ics.calendar, "METHOD")).toBe("PUBLISH");
    expect(get(ics.calendar, "X-WR-CALNAME")).toBe("Haunted: Oakland Cemetery");
    expect(unescape(get(ics.calendar, "X-WR-CALDESC")!)).toContain("at least 25 years ago");
    expect(ics.calendar.find((p) => p.name === "REFRESH-INTERVAL")).toEqual({
      name: "REFRESH-INTERVAL",
      params: ["VALUE=DURATION"],
      value: "P1D",
    });
    expect(get(ics.calendar, "X-PUBLISHED-TTL")).toBe("P1D");
  });

  it("gives every event the required properties", () => {
    expect(ics.events.length).toBeGreaterThan(30);
    for (const ev of ics.events) {
      expect(get(ev, "UID")).toMatch(/^Q\d+-(death|birth)@between-two-tombstones$/);
      expect(get(ev, "DTSTAMP")).toBe("20261020T024103Z");
      expect(get(ev, "DTSTART")).toMatch(/^\d{8}$/);
      expect(get(ev, "RRULE")).toMatch(/^FREQ=YEARLY/);
      expect(get(ev, "TRANSP")).toBe("TRANSPARENT");
      expect(get(ev, "LOCATION")).toBe("Oakland Cemetery\\, Atlanta");
      expect(get(ev, "GEO")).toBe("33.748722;-84.371333");
      expect(get(ev, "URL")).toMatch(new RegExp(`^${SITE_URL}/cemetery/Q2008469#Q\\d+$`));
    }
  });

  it("writes Margaret Mitchell's event as specified", () => {
    const ev = ics.events.find((e) => get(e, "UID") === "Q173540-death@between-two-tombstones")!;
    expect(get(ev, "DTSTART")).toBe("19490816");
    expect(get(ev, "RRULE")).toBe("FREQ=YEARLY");
    expect(unescape(get(ev, "SUMMARY")!)).toBe("Margaret Mitchell died on this day in 1949");
    expect(get(ev, "URL")).toBe(`${SITE_URL}/cemetery/Q2008469#Q173540`);
    const description = unescape(get(ev, "DESCRIPTION")!);
    expect(description).toBe(
      [
        "Margaret Munnerlyn Mitchell (November 8, 1900 – August 16, 1949) was an American novelist and journalist.",
        "Buried at Oakland Cemetery, Atlanta.",
        `Story: ${SITE_URL}/cemetery/Q2008469#Q173540`,
        "From Wikipedia, CC BY-SA 4.0: https://en.wikipedia.org/wiki/Margaret_Mitchell",
      ].join("\n"),
    );
    const birth = ics.events.find((e) => get(e, "UID") === "Q173540-birth@between-two-tombstones")!;
    expect(get(birth, "DTSTART")).toBe("19001108"); // the best-rank Nov 8, not Nov 9
  });

  it("leaves GEO out when the cemetery has no coordinates", () => {
    const snap = snapshot([person({ qid: "Q50" })]);
    snap.cemetery.coord = null;
    const parsed = tinyParse(buildCalendar(snap, opts()));
    expect(get(parsed.events[0], "GEO")).toBeUndefined();
  });

  it("escapes names and text with commas and semicolons", () => {
    const snap = snapshot([
      person({
        qid: "Q60",
        name: "Ivan Allen, Jr.",
        wikipedia: { title: "x", extract: "One; two, three\\four.", url: "https://en.wikipedia.org/wiki/X" },
      }),
    ]);
    const parsed = tinyParse(buildCalendar(snap, opts()));
    expect(get(parsed.events[0], "SUMMARY")).toBe("Ivan Allen\\, Jr. died on this day in 1900");
    expect(get(parsed.events[0], "DESCRIPTION")).toContain("One\\; two\\, three\\\\four.\\nBuried at Test Cemetery\\, Testville.");
  });
});

describe("excerpt", () => {
  it("keeps initials, abbreviations and dates inside the first sentence", () => {
    const text =
      "Thomas E. Askew (c. 1847 – July 12, 1914) was an African American photographer based in Atlanta, Georgia. He was among the earliest Black professional photographers in Atlanta, and is best known as a principal contributor to W. E. B. Du Bois's Exhibit of American Negroes at the 1900 Paris Exposition.";
    // Both sentences fit in 320 characters, and neither "c.", "E." nor "W. E. B." ends one.
    expect(excerpt(text)).toBe(text);
    expect(excerpt(text, 200)).toBe(
      "Thomas E. Askew (c. 1847 – July 12, 1914) was an African American photographer based in Atlanta, Georgia.",
    );
  });

  it("ends a sentence after a decade or a number, not just after a word", () => {
    expect(excerpt("She worked there until the early 1960s. A 1984 manual honored her.", 45)).toBe(
      "She worked there until the early 1960s.",
    );
    expect(excerpt("He was born in 1850. He died later.", 25)).toBe("He was born in 1850.");
  });

  it("adds the second sentence when both stay short", () => {
    expect(excerpt("Richard Peters was a railroad man. He founded Atlanta. He also did more.")).toBe(
      "Richard Peters was a railroad man. He founded Atlanta.",
    );
    expect(excerpt("Served as U.S. ambassador to Israel. Then went home.")).toBe(
      "Served as U.S. ambassador to Israel. Then went home.",
    );
  });

  it("cuts a very long first sentence at a word with an ellipsis", () => {
    const out = excerpt(`${"word ".repeat(200)}end.`);
    expect(out.length).toBeLessThanOrEqual(320);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("is empty for no text", () => {
    expect(excerpt(null)).toBe("");
    expect(excerpt("   ")).toBe("");
  });
});

describe("labels", () => {
  it("names the cemetery with its place and makes an ASCII file name", () => {
    expect(cemeteryLabel(OAKLAND.cemetery)).toBe("Oakland Cemetery, Atlanta");
    expect(cemeterySlug(OAKLAND.cemetery)).toBe("oakland-cemetery-atlanta");
    expect(cemeterySlug(SLEEPY.cemetery)).toBe("sleepy-hollow-cemetery");
    expect(cemeterySlug({ qid: "Q5", name: "Cimetière du Père-Lachaise", locatedIn: "Paris" })).toBe(
      "cimetiere-du-pere-lachaise-paris",
    );
    expect(cemeterySlug({ qid: "Q7", name: "墓地", locatedIn: null })).toBe("q7");
  });
});
