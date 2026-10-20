import { describe, expect, it } from "vitest";
import { handleCalendarRequest } from "./handler";
import { CalendarNotAvailableError, snapshotSource, type BurialsSource } from "./source";

const NOW = () => new Date("2026-10-20T12:00:00Z");

function call(path: string, source: BurialsSource = snapshotSource) {
  const url = new URL(path, "http://localhost:3108");
  const qid = decodeURIComponent(url.pathname.split("/").pop()!);
  return handleCalendarRequest(new Request(url), qid, { source, now: NOW, siteUrl: "https://example.test" });
}

function countEvents(text: string) {
  return text.split("\r\n").filter((l) => l === "BEGIN:VEVENT").length;
}

describe("GET /api/calendar/[qid]", () => {
  it("answers 200 text/calendar with the download name and a day of caching", async () => {
    const res = await call("/api/calendar/Q2008469");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="oakland-cemetery-atlanta.ics"');
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    const text = await res.text();
    expect(countEvents(text)).toBe(30);
  });

  it("accepts a trailing .ics", async () => {
    const res = await call("/api/calendar/Q360779.ics?limit=5");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('inline; filename="sleepy-hollow-cemetery.ics"');
    expect(countEvents(await res.text())).toBe(5);
  });

  it("adds birthdays with kinds=death,birth", async () => {
    const text = await (await call("/api/calendar/Q2008469?kinds=death,birth&limit=5")).text();
    expect(countEvents(text)).toBeGreaterThan(5);
    expect(text).toContain("-birth@between-two-tombstones");
  });

  it("answers 400 with a plain message for bad parameters", async () => {
    for (const q of ["?limit=0", "?limit=81", "?limit=x", "?kinds=wedding", "?kinds="]) {
      const res = await call(`/api/calendar/Q2008469${q}`);
      expect(res.status, q).toBe(400);
      const json = (await res.json()) as { error: { source: string; message: string } };
      expect(json.error.source).toBe("Calendar");
      expect(json.error.message.length).toBeGreaterThan(10);
    }
  });

  it("answers 400 for something that isn't a QID", async () => {
    const res = await call("/api/calendar/oakland");
    expect(res.status).toBe(400);
  });

  it("answers 404 JSON for a cemetery it doesn't have", async () => {
    const res = await call("/api/calendar/Q872253");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({
      error: { source: "Calendar", message: "This cemetery isn't available for calendars yet." },
    });
  });

  it("passes a live loader's named failure through, and names its own otherwise", async () => {
    const wikidataDown: BurialsSource = async () => {
      throw Object.assign(new Error("Couldn't reach Wikidata. Try again in a minute."), { source: "Wikidata", status: 503 });
    };
    const res = await call("/api/calendar/Q2008469", wikidataDown);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute." } });

    const broken: BurialsSource = async () => {
      throw new TypeError("x is undefined");
    };
    const res2 = await call("/api/calendar/Q2008469", broken);
    expect(res2.status).toBe(502);
    const json = (await res2.json()) as { error: { source: string; message: string } };
    expect(json.error.source).toBe("Calendar");
    expect(json.error.message).not.toContain("undefined"); // no internals leak

    const notHere: BurialsSource = async () => {
      throw new CalendarNotAvailableError();
    };
    expect((await call("/api/calendar/Q2008469", notHere)).status).toBe(404);
  });
});
