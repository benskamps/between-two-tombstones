import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { seedHaunt } from "./fixtures/haunt";
import oaklandJson from "../../data/snapshots/oakland-atlanta.json";
import sleepyJson from "../../data/snapshots/sleepy-hollow.json";
import { buildCalendar } from "../../lib/calendar/feed";
import type { CemeterySnapshot, Person } from "../../lib/types";

// Lane 8: Haunted Calendar. The feed (GET /api/calendar/[qid]) and the
// /calendar page, against a running server.
//
// The expectations below are worked out independently from the bundled
// snapshots (data/snapshots/*.json), which is what the server serves until
// Lane 2's live loader is swapped in. The iCalendar reader here is a separate,
// deliberately tiny one (unfold + split), not lib/calendar/ics.ts.

const OAKLAND = oaklandJson as CemeterySnapshot;
const SLEEPY = sleepyJson as CemeterySnapshot;
const THIS_YEAR = new Date().getUTCFullYear();
const LEAP_RULE = "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1";

// ---------------------------------------------------------------------------
// Tiny iCalendar reader

type Prop = { name: string; params: string[]; value: string };

function events(text: string): Prop[][] {
  const lines = text.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
  const out: Prop[][] = [];
  let ev: Prop[] | null = null;
  for (const line of lines) {
    const colon = line.indexOf(":");
    const [name, ...params] = line.slice(0, colon).split(";");
    const value = line.slice(colon + 1);
    if (name === "BEGIN" && value === "VEVENT") ev = [];
    else if (name === "END" && value === "VEVENT") {
      out.push(ev!);
      ev = null;
    } else if (ev) ev.push({ name, params, value });
  }
  return out;
}

function val(ev: Prop[], name: string): string {
  return ev.find((p) => p.name === name)?.value ?? "";
}

function unescape(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c.toLowerCase() === "n" ? "\n" : c));
}

// ---------------------------------------------------------------------------
// Who should be in a feed, worked out from the snapshot

function year(iso: string | null): number | null {
  const m = iso?.match(/^\+?(\d{1,4})-/);
  return m ? Number(m[1]) : null;
}

function longDead(p: Person): boolean {
  const y = year(p.death);
  return y !== null && THIS_YEAR - y >= 25;
}

function expectedUids(snap: CemeterySnapshot, kinds: ("death" | "birth")[], limit: number): string[] {
  const has = (p: Person, k: "death" | "birth") => (k === "death" ? p.deathPrecision : p.birthPrecision) === 11;
  const chosen = snap.people
    .filter((p) => longDead(p) && kinds.some((k) => has(p, k)))
    .sort((a, b) => b.sitelinks - a.sitelinks || Number(a.qid.slice(1)) - Number(b.qid.slice(1)))
    .slice(0, limit);
  return chosen.flatMap((p) =>
    (["death", "birth"] as const).filter((k) => kinds.includes(k) && has(p, k)).map((k) => `${p.qid}-${k}@between-two-tombstones`),
  );
}

async function feed(request: APIRequestContext, path: string): Promise<string> {
  const res = await request.get(path);
  expect(res.status(), path).toBe(200);
  return res.text();
}

// ---------------------------------------------------------------------------
// Page helpers

type YMD = { y: number; m: number; d: number };

function key({ y, m, d }: YMD): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Next date on or after `from` for DTSTART + RRULE, the simple way: walk the next 9 years. */
function nextDate(dtstart: string, rrule: string, from: YMD): YMD {
  const m = Number(dtstart.slice(4, 6));
  const d = Number(dtstart.slice(6, 8));
  for (let y = from.y; y < from.y + 9; y++) {
    const date = rrule === LEAP_RULE ? { y, m: 2, d: isLeap(y) ? 29 : 28 } : { y, m, d };
    if (date.m === 2 && date.d === 29 && !isLeap(y)) continue;
    if (key(date) >= key(from)) return date;
  }
  throw new Error(`no date for ${dtstart}`);
}

async function open(page: Page, path: string, fixedNoon?: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("btt-etiquette-seen", "1");
    } catch {
      // ignore
    }
  });
  if (fixedNoon) await page.clock.setFixedTime(new Date(`${fixedNoon}T12:00:00`));
  // /calendar without a cemetery in the link opens once you have a haunt (decision 18e). After the clock, so it's fresh then.
  await seedHaunt(page);
  await page.goto(path);
}

function synthetic(death: string): CemeterySnapshot {
  // A made-up person, served only to this test's browser through page.route.
  const base = OAKLAND.people[0];
  return {
    ...OAKLAND,
    people: [{ ...base, qid: "Q4115189", name: "Leap Day Test Person", death, deathPrecision: 11, wikipedia: null }],
  };
}

// ---------------------------------------------------------------------------

test.describe("Haunted Calendar feed", () => {
  test("serves text/calendar with the download name and a day of caching", async ({ request }) => {
    const res = await request.get("/api/calendar/Q2008469");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(res.headers()["content-disposition"]).toBe('inline; filename="oakland-cemetery-atlanta.ics"');
    expect(res.headers()["cache-control"]).toBe("public, max-age=86400");
    const text = await res.text();
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    for (const line of [
      "PRODID:-//Between Two Tombstones//Haunted Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Haunted: Oakland Cemetery",
      "REFRESH-INTERVAL;VALUE=DURATION:P1D",
      "X-PUBLISHED-TTL:P1D",
    ]) {
      expect(text).toContain(`\r\n${line}\r\n`);
    }
    expect(events(text)).toHaveLength(30); // default limit
  });

  test("accepts a trailing .ics", async ({ request }) => {
    const res = await request.get("/api/calendar/Q360779.ics");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toBe('inline; filename="sleepy-hollow-cemetery.ics"');
  });

  test("every line is at most 75 octets, CRLF only, and no character is split", async ({ request }) => {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (const path of [
      "/api/calendar/Q2008469",
      "/api/calendar/Q2008469?kinds=death,birth&limit=80",
      "/api/calendar/Q360779.ics?kinds=death,birth&limit=80",
    ]) {
      const body = await (await request.get(path)).body();
      const text = decoder.decode(body); // throws on invalid UTF-8
      expect(text.endsWith("\r\n"), path).toBe(true);
      expect(text.replace(/\r\n/g, ""), `${path}: bare CR or LF`).not.toMatch(/[\r\n]/);
      const physical = text.slice(0, -2).split("\r\n");
      const tooLong = physical.filter((line) => new TextEncoder().encode(line).length > 75);
      expect(tooLong, path).toEqual([]);
      // The raw bytes of each physical line decode strictly on their own: no character cut at a fold.
      const cut: number[] = [];
      let start = 0;
      for (let i = 0; i + 1 < body.length; i++) {
        if (body[i] === 0x0d && body[i + 1] === 0x0a) {
          try {
            decoder.decode(body.subarray(start, i));
          } catch {
            cut.push(start);
          }
          start = i + 2;
        }
      }
      expect(cut, path).toEqual([]);
      expect(physical.length).toBeGreaterThan(50);
      // There is real multi-byte text in these feeds (en dashes in the Wikipedia dates).
      expect(body.length).toBeGreaterThan(text.length);
    }
  });

  test("limit=5 gives the five most famous long-dead people", async ({ request }) => {
    const deaths = events(await feed(request, "/api/calendar/Q2008469?limit=5"));
    expect(deaths).toHaveLength(5);
    expect(deaths.map((e) => val(e, "UID"))).toEqual(expectedUids(OAKLAND, ["death"], 5));

    const both = events(await feed(request, "/api/calendar/Q2008469?kinds=death,birth&limit=5"));
    expect(both.map((e) => val(e, "UID"))).toEqual(expectedUids(OAKLAND, ["death", "birth"], 5));
    expect(both.length).toBeGreaterThan(5);

    const sleepy = events(await feed(request, "/api/calendar/Q360779?limit=5"));
    expect(sleepy.map((e) => val(e, "UID"))).toEqual(expectedUids(SLEEPY, ["death"], 5));
  });

  test("events are yearly, all-day, transparent and link to the story card", async ({ request }) => {
    const all = events(await feed(request, "/api/calendar/Q2008469?kinds=death,birth&limit=80"));
    expect(all.map((e) => val(e, "UID"))).toEqual(expectedUids(OAKLAND, ["death", "birth"], 80));
    for (const ev of all) {
      expect(ev.find((p) => p.name === "DTSTART")?.params).toEqual(["VALUE=DATE"]);
      expect(val(ev, "DTSTAMP")).toMatch(/^\d{8}T\d{6}Z$/);
      expect(val(ev, "TRANSP")).toBe("TRANSPARENT");
      expect(val(ev, "LOCATION")).toBe("Oakland Cemetery\\, Atlanta");
      expect(val(ev, "GEO")).toBe("33.748722;-84.371333");
      const qid = val(ev, "UID").split("-")[0];
      expect(val(ev, "URL")).toMatch(new RegExp(`/cemetery/Q2008469#stop-${qid}$`));
      expect(unescape(val(ev, "DESCRIPTION"))).toContain("Buried at Oakland Cemetery, Atlanta.");
      expect(unescape(val(ev, "DESCRIPTION"))).toContain(`Story: ${val(ev, "URL")}`);
    }
    const mitchell = all.find((e) => val(e, "UID") === "Q173540-death@between-two-tombstones")!;
    expect(val(mitchell, "DTSTART")).toBe("19490816");
    expect(val(mitchell, "RRULE")).toBe("FREQ=YEARLY");
    expect(unescape(val(mitchell, "SUMMARY"))).toBe("Margaret Mitchell died on this day in 1949");
    expect(unescape(val(mitchell, "DESCRIPTION"))).toContain("From Wikipedia, CC BY-SA 4.0");

    const sleepy = events(await feed(request, "/api/calendar/Q360779?kinds=death,birth&limit=80"));
    const irving = sleepy.find((e) => unescape(val(e, "SUMMARY")).startsWith("Washington Irving was born"))!;
    expect(unescape(val(irving, "SUMMARY"))).toBe("Washington Irving was born on this day in 1783");
    expect(val(irving, "DTSTART")).toBe("17830403");
  });

  test("never puts a recent death in anyone's calendar", async ({ request }) => {
    const recentNames = ["Leona Helmsley", "Brooke Astor", "Ogden R. Reid", "Peter A. Peyser", "Maynard Jackson", "Ivan Allen"];
    for (const [qid, snap] of [
      ["Q2008469", OAKLAND],
      ["Q360779", SLEEPY],
    ] as const) {
      const text = await feed(request, `/api/calendar/${qid}?kinds=death,birth&limit=80`);
      const summaries = events(text).map((ev) => unescape(val(ev, "SUMMARY")));
      for (const name of recentNames) expect(summaries.filter((s) => s.startsWith(name)), name).toEqual([]);
      const recent = snap.people.filter((p) => !longDead(p));
      expect(recent.length).toBeGreaterThan(0); // the snapshots do have recent and unknown deaths
      // The feed uses the live loader, so check each person against the same
      // live data (the burials route), falling back to the saved snapshot.
      const live = await request.get(`/api/cemeteries/${qid}/burials`);
      const people = live.ok() ? ((await live.json()) as typeof snap).people : snap.people;
      for (const ev of events(text)) {
        const uidQid = val(ev, "UID").split("-")[0];
        const person = people.find((p) => p.qid === uidQid) ?? snap.people.find((p) => p.qid === uidQid);
        expect(person, uidQid).toBeDefined();
        expect(longDead(person!), person!.name).toBe(true);
      }
    }
  });

  test("uses only day-precision dates", async ({ request }) => {
    const all = events(await feed(request, "/api/calendar/Q2008469?kinds=death,birth&limit=80"));
    const uids = new Set(all.map((e) => val(e, "UID")));
    const fuzzy = OAKLAND.people.filter((p) => longDead(p) && p.deathPrecision !== 11);
    expect(fuzzy.length).toBeGreaterThan(0);
    for (const p of fuzzy) expect(uids.has(`${p.qid}-death@between-two-tombstones`), p.name).toBe(false);
  });

  test("Feb 29 dates recur on the last day of February; every other date is plain yearly", async ({ request }) => {
    // The bundled data has no Feb 29 dates, so this checks the rule holds on
    // whatever the server serves; the browser test below drives a real Feb 29.
    for (const path of ["/api/calendar/Q2008469?kinds=death,birth&limit=80", "/api/calendar/Q360779?kinds=death,birth&limit=80"]) {
      for (const ev of events(await feed(request, path))) {
        const start = val(ev, "DTSTART");
        const y = Number(start.slice(0, 4));
        const m = Number(start.slice(4, 6));
        const d = Number(start.slice(6, 8));
        expect(new Date(Date.UTC(2000, m - 1, d)).getUTCDate(), start).toBe(d); // a real month/day
        if (m === 2 && d === 29) {
          expect(isLeap(y)).toBe(true);
          expect(val(ev, "RRULE")).toBe(LEAP_RULE);
        } else {
          expect(val(ev, "RRULE")).toBe("FREQ=YEARLY");
        }
      }
    }
  });

  test("answers 400 with a plain message for bad parameters", async ({ request }) => {
    for (const q of ["limit=0", "limit=81", "limit=abc", "limit=2.5", "kinds=wedding", "kinds=", "kinds=death&kinds=birth"]) {
      const res = await request.get(`/api/calendar/Q2008469?${q}`);
      expect(res.status(), q).toBe(400);
      const json = await res.json();
      expect(json.error.source, q).toBe("Calendar");
      expect(json.error.message, q).toMatch(/kinds|limit/);
    }
    const notQid = await request.get("/api/calendar/oakland");
    expect(notQid.status()).toBe(400);
  });

  test("answers 404 JSON for a place with no burials to put in a calendar", async ({ request }) => {
    // Q42 is a person, not a cemetery: the live loader finds no burials there.
    for (const path of ["/api/calendar/Q42", "/api/calendar/Q42.ics"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(404);
      expect(res.headers()["content-type"]).toContain("application/json");
      expect(await res.json()).toEqual({
        error: { source: "Calendar", message: "This cemetery isn't available for calendars yet." },
      });
    }
  });
});

test.describe("Haunted Calendar page", () => {
  test("shows what you'll get and the next five events from today", async ({ page, request }) => {
    const today = { y: 2026, m: 10, d: 20 };
    await open(page, "/calendar", "2026-10-20");
    await expect(page.getByRole("heading", { name: "Haunted Calendar" })).toBeVisible();
    await expect(page.getByTestId("calendar-summary")).toHaveText("30 death-days from Oakland Cemetery, Atlanta, every year");

    // Expected: the same feed, each event's next date on or after today, soonest first (feed order on ties).
    const evs = events(await feed(request, "/api/calendar/Q2008469"));
    const expected = evs
      .map((ev, i) => ({ uid: val(ev, "UID"), i, date: key(nextDate(val(ev, "DTSTART"), val(ev, "RRULE"), today)) }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i)
      .slice(0, 5);

    const items = page.getByTestId("preview-event");
    await expect(items).toHaveCount(5);
    const got = await items.evaluateAll((els) => els.map((el) => ({ uid: el.dataset.uid, date: el.dataset.date })));
    expect(got).toEqual(expected.map(({ uid, date }) => ({ uid, date })));
    for (const [n, item] of (await items.all()).entries()) {
      const ev = evs.find((e) => val(e, "UID") === expected[n].uid)!;
      await expect(item).toContainText(unescape(val(ev, "SUMMARY")));
      await expect(item.getByRole("link", { name: "Read their story" })).toHaveAttribute(
        "href",
        `/cemetery/Q2008469#stop-${expected[n].uid.split("-")[0]}`,
      );
    }

    await expect(page.getByText("Only people who died at least 25 years ago are included.")).toBeVisible();
    await expect(
      page.getByText("To stop the haunting, remove the subscription from your calendar app; nothing is stored about you."),
    ).toBeVisible();
  });

  test("builds the Apple, Google and Outlook links from the current origin", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const host = new URL(baseURL!).host;
    await open(page, "/calendar");

    async function expectLinks(path: string, name: string) {
      const feedUrl = `${origin}${path}`;
      const webcal = `webcal://${host}${path}`;
      await expect(page.getByRole("link", { name: "Add to Apple Calendar" })).toHaveAttribute("href", webcal);
      await expect(page.getByRole("link", { name: "Add to Google Calendar" })).toHaveAttribute(
        "href",
        `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
      );
      await expect(page.getByRole("link", { name: "Add to Outlook" })).toHaveAttribute(
        "href",
        `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`,
      );
      await expect(page.getByRole("link", { name: "Download .ics" })).toHaveAttribute("href", path);
      await expect(page.getByTestId("feed-url")).toHaveValue(feedUrl);
    }

    await expectLinks("/api/calendar/Q2008469", "Haunted: Oakland Cemetery");

    // Birthdays too: the summary and every link change with it.
    const births = expectedUids(OAKLAND, ["death", "birth"], 30).filter((u) => u.endsWith("-birth@between-two-tombstones")).length;
    await page.getByRole("switch", { name: "Add birthdays too" }).check();
    await expect(page.getByTestId("calendar-summary")).toHaveText(
      `30 death-days and ${births} birthdays from Oakland Cemetery, Atlanta, every year`,
    );
    await expectLinks("/api/calendar/Q2008469?kinds=death,birth", "Haunted: Oakland Cemetery");

    await page.getByRole("radio", { name: /Sleepy Hollow Cemetery/ }).check();
    await expectLinks("/api/calendar/Q360779?kinds=death,birth", "Haunted: Sleepy Hollow Cemetery");
    await expect(page).toHaveURL(/\?cemetery=Q360779$/);

    // Every link the page builds is one the feed answers.
    for (const path of ["/api/calendar/Q2008469", "/api/calendar/Q2008469?kinds=death,birth", "/api/calendar/Q360779?kinds=death,birth"]) {
      expect((await page.request.get(path)).status(), path).toBe(200);
    }

    // Tap targets are at least 48 px tall.
    for (const name of ["Add to Apple Calendar", "Add to Google Calendar", "Add to Outlook", "Download .ics"]) {
      const box = await page.getByRole("link", { name }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(48);
    }
  });

  test("?cemetery= preselects, and Download .ics saves the feed", async ({ page, baseURL }) => {
    await open(page, "/calendar?cemetery=Q360779");
    await expect(page.getByRole("radio", { name: /Sleepy Hollow Cemetery/ })).toBeChecked();
    await expect(page.getByTestId("calendar-summary")).toHaveText(
      "30 death-days from Sleepy Hollow Cemetery, Sleepy Hollow, every year",
    );
    await expect(page.getByRole("link", { name: "Add to Apple Calendar" })).toHaveAttribute(
      "href",
      `webcal://${new URL(baseURL!).host}/api/calendar/Q360779`,
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download .ics" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("sleepy-hollow-cemetery.ics");
  });

  test("copies the feed address and says when this host can't be subscribed to", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "/calendar");
    await page.getByRole("button", { name: "Copy address" }).click();
    await expect(page.getByText("Address copied.", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(baseURL!).origin}/api/calendar/Q2008469`);

    const notPublic =
      "Subscribing works once the app is on its public address; preview links ask for a login your calendar can’t do.";
    if (["localhost", "127.0.0.1"].includes(new URL(baseURL!).hostname)) {
      await expect(page.getByTestId("not-public")).toHaveText(notPublic);
    }
  });

  test("a malformed ?cemetery= falls back to the first sample", async ({ page }) => {
    await open(page, "/calendar?cemetery=oakland");
    await expect(page.getByRole("radio", { name: /Oakland Cemetery/ })).toBeChecked();
  });

  test("a cemetery passed from its tour page is offered and selected", async ({ page }) => {
    await page.route("**/api/calendar/Q872253*", (route) =>
      route.fulfill({ status: 200, contentType: "text/calendar; charset=utf-8", body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" }),
    );
    await open(page, "/calendar?cemetery=Q872253&name=Lake%20View%20Cemetery&place=Seattle");
    await expect(page.getByRole("radio", { name: /Lake View Cemetery/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Oakland Cemetery/ })).not.toBeChecked();
  });

  test("a Feb 29 death previews on Feb 28 in a common year and Feb 29 in a leap year", async ({ page }) => {
    // The server's own generator, run on a made-up leap-day person, served to this browser only.
    const ics = buildCalendar(synthetic("1904-02-29T00:00:00Z"), { kinds: ["death"], limit: 30, now: new Date() });
    expect(ics).toContain(`RRULE:${LEAP_RULE}`);
    await page.route("**/api/calendar/Q2008469", (route) =>
      route.fulfill({ status: 200, contentType: "text/calendar; charset=utf-8", body: ics }),
    );

    await open(page, "/calendar", "2027-02-20");
    const first = page.getByTestId("preview-event").first();
    await expect(first).toHaveAttribute("data-date", "2027-02-28");
    await expect(first).toContainText("Leap Day Test Person died on this day in 1904");

    await page.clock.setFixedTime(new Date("2028-02-20T12:00:00"));
    // A year on, yesterday's haunt is stale; keep one fresh at the new date (registered after the clock).
    await seedHaunt(page);
    await page.reload();
    await expect(page.getByTestId("preview-event").first()).toHaveAttribute("data-date", "2028-02-29");
  });
});
