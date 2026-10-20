import { describe, expect, it } from "vitest";
import { feedPath, parseFeedParams, parseQidSegment, subscribeLinks } from "./params";

function parse(query: string) {
  return parseFeedParams(new URLSearchParams(query));
}

describe("parseQidSegment", () => {
  it("accepts a QID with or without .ics", () => {
    expect(parseQidSegment("Q2008469")).toBe("Q2008469");
    expect(parseQidSegment("Q2008469.ics")).toBe("Q2008469");
    expect(parseQidSegment("Q2008469.ICS")).toBe("Q2008469");
  });

  it("rejects anything else", () => {
    for (const bad of ["", "Q", "Q0", "Q012", "q2008469", "2008469", "Q2008469.json", "Q1.ics.ics", "Q99999999999999", "../x"]) {
      expect(parseQidSegment(bad), bad).toBeNull();
    }
  });
});

describe("parseFeedParams", () => {
  it("defaults to death-days, 30 people", () => {
    expect(parse("")).toEqual({ ok: true, value: { kinds: ["death"], limit: 30 } });
  });

  it("reads kinds in any order, always death first", () => {
    expect(parse("kinds=death,birth")).toEqual({ ok: true, value: { kinds: ["death", "birth"], limit: 30 } });
    expect(parse("kinds=birth,death")).toEqual({ ok: true, value: { kinds: ["death", "birth"], limit: 30 } });
    expect(parse("kinds=birth")).toEqual({ ok: true, value: { kinds: ["birth"], limit: 30 } });
    expect(parse("kinds=death%2Cbirth&limit=5")).toEqual({ ok: true, value: { kinds: ["death", "birth"], limit: 5 } });
  });

  it("reads limit from 1 to 80", () => {
    expect(parse("limit=1")).toMatchObject({ ok: true, value: { limit: 1 } });
    expect(parse("limit=80")).toMatchObject({ ok: true, value: { limit: 80 } });
  });

  it("rejects bad values with a plain message", () => {
    for (const q of ["kinds=", "kinds=wedding", "kinds=death,", "kinds=death,funeral", "kinds=death&kinds=birth"]) {
      const r = parse(q);
      expect(r.ok, q).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/kinds/);
    }
    for (const q of ["limit=0", "limit=81", "limit=-1", "limit=1.5", "limit=abc", "limit=", "limit=1e2", "limit=5&limit=6"]) {
      const r = parse(q);
      expect(r.ok, q).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/limit/);
    }
  });

  it("ignores parameters it doesn't know", () => {
    expect(parse("utm_source=x")).toEqual({ ok: true, value: { kinds: ["death"], limit: 30 } });
  });
});

describe("feedPath and subscribe links", () => {
  it("leaves defaults out of the path", () => {
    expect(feedPath("Q2008469")).toBe("/api/calendar/Q2008469");
    expect(feedPath("Q2008469", { kinds: ["death"], limit: 30 })).toBe("/api/calendar/Q2008469");
    expect(feedPath("Q2008469", { kinds: ["birth", "death"] })).toBe("/api/calendar/Q2008469?kinds=death,birth");
    expect(feedPath("Q360779", { kinds: ["death"], limit: 5 })).toBe("/api/calendar/Q360779?limit=5");
  });

  it("every path it builds parses back to the same settings", () => {
    const path = feedPath("Q360779", { kinds: ["death", "birth"], limit: 12 });
    const url = new URL(path, "https://x.test");
    expect(parseQidSegment(url.pathname.split("/").pop()!)).toBe("Q360779");
    expect(parseFeedParams(url.searchParams)).toEqual({ ok: true, value: { kinds: ["death", "birth"], limit: 12 } });
  });

  it("builds the Apple, Google and Outlook links from the origin", () => {
    const links = subscribeLinks(
      "https://between-two-tombstones.vercel.app",
      "/api/calendar/Q2008469?kinds=death,birth",
      "Haunted: Oakland Cemetery",
    );
    expect(links.feed).toBe("https://between-two-tombstones.vercel.app/api/calendar/Q2008469?kinds=death,birth");
    expect(links.apple).toBe("webcal://between-two-tombstones.vercel.app/api/calendar/Q2008469?kinds=death,birth");
    expect(links.google).toBe(
      "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fbetween-two-tombstones.vercel.app%2Fapi%2Fcalendar%2FQ2008469%3Fkinds%3Ddeath%2Cbirth",
    );
    expect(links.outlook).toBe(
      "https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fbetween-two-tombstones.vercel.app%2Fapi%2Fcalendar%2FQ2008469%3Fkinds%3Ddeath%2Cbirth&name=Haunted%3A%20Oakland%20Cemetery",
    );
    // Round trip: Google's cid and Outlook's url decode back to the feed.
    expect(new URL(links.google).searchParams.get("cid")).toBe(links.apple);
    expect(new URL(links.outlook).searchParams.get("url")).toBe(links.feed);
    expect(new URL(links.outlook).searchParams.get("name")).toBe("Haunted: Oakland Cemetery");
  });

  it("works on a local http origin too", () => {
    const links = subscribeLinks("http://localhost:3108/", "/api/calendar/Q360779", "Haunted: Sleepy Hollow Cemetery");
    expect(links.feed).toBe("http://localhost:3108/api/calendar/Q360779");
    expect(links.apple).toBe("webcal://localhost:3108/api/calendar/Q360779");
  });
});
