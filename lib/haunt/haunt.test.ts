import { describe, expect, it } from "vitest";
import {
  cemeteryFromParams,
  cemeteryQuery,
  cleanText,
  gateState,
  hauntInputFromUrl,
  hubHref,
  isShareLink,
  makeHaunt,
  parseHaunt,
  serializeHaunt,
  type Haunt,
} from "./haunt";

const NOW = new Date("2026-10-21T02:00:00Z");
const params = (q: string) => {
  const p = new URLSearchParams(q);
  return (k: string) => p.get(k);
};

describe("makeHaunt", () => {
  it("keeps qid, name, place and the time", () => {
    expect(makeHaunt({ qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" }, NOW)).toEqual({
      qid: "Q2008469",
      name: "Oakland Cemetery",
      place: "Atlanta",
      at: "2026-10-21T02:00:00.000Z",
    });
  });

  it("drops an empty place and normalizes the qid", () => {
    expect(makeHaunt({ qid: " q360779 ", name: "Sleepy Hollow Cemetery", place: "  " }, NOW)).toEqual({
      qid: "Q360779",
      name: "Sleepy Hollow Cemetery",
      at: NOW.toISOString(),
    });
  });

  it("refuses a bad qid or a missing name", () => {
    expect(makeHaunt({ qid: "oakland", name: "Oakland" }, NOW)).toBeNull();
    expect(makeHaunt({ qid: "Q0", name: "Oakland" }, NOW)).toBeNull();
    expect(makeHaunt({ qid: "Q2008469", name: "   " }, NOW)).toBeNull();
  });

  it("caps and cleans the text it keeps", () => {
    const h = makeHaunt({ qid: "Q1", name: `A\u0000B\n  C${"x".repeat(300)}`, place: "y".repeat(300) }, NOW)!;
    expect(h.name.startsWith("A B C")).toBe(true);
    expect(h.name.length).toBeLessThanOrEqual(120);
    expect(h.place!.length).toBeLessThanOrEqual(80);
    expect(cleanText(42, 10)).toBeUndefined();
  });
});

describe("parseHaunt / serializeHaunt", () => {
  const h: Haunt = { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta", at: NOW.toISOString() };

  it("round-trips", () => {
    expect(parseHaunt(serializeHaunt(h))).toEqual(h);
    const noPlace = { qid: "Q1", name: "X", at: NOW.toISOString() };
    expect(parseHaunt(serializeHaunt(noPlace))).toEqual(noPlace);
  });

  it("treats anything malformed as no haunt", () => {
    for (const raw of [null, undefined, "", "not json", "null", "42", "[]", '{"qid":"Q1"}', '{"qid":"Q1","name":"X"}', '{"qid":"nope","name":"X","at":"2026-10-21T00:00:00Z"}', '{"qid":"Q1","name":"X","at":"yesterday"}']) {
      expect(parseHaunt(raw), String(raw)).toBeNull();
    }
  });
});

describe("cemeteryFromParams", () => {
  it("reads ?cemetery=&name=&place=", () => {
    expect(cemeteryFromParams(params("cemetery=Q872253&name=Lake%20View%20Cemetery&place=Seattle"))).toEqual({
      qid: "Q872253",
      name: "Lake View Cemetery",
      place: "Seattle",
    });
    expect(cemeteryFromParams(params("cemetery=q360779"))).toEqual({ qid: "Q360779" });
  });

  it("ignores a malformed or missing cemetery", () => {
    expect(cemeteryFromParams(params("cemetery=oakland"))).toBeNull();
    expect(cemeteryFromParams(params(""))).toBeNull();
    expect(cemeteryFromParams(params("name=Oakland"))).toBeNull();
  });
});

describe("hauntInputFromUrl", () => {
  const known = [{ qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta, Georgia" }];
  it("names the cemetery from the link, else from what the page knows", () => {
    expect(hauntInputFromUrl({ qid: "Q872253", name: "Lake View Cemetery" }, known)).toEqual({ qid: "Q872253", name: "Lake View Cemetery", place: undefined });
    expect(hauntInputFromUrl({ qid: "Q2008469" }, known)).toEqual({ qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta, Georgia" });
  });
  it("waits when the name isn't known yet", () => {
    expect(hauntInputFromUrl({ qid: "Q999999" }, known)).toBeNull();
  });
});

describe("gateState", () => {
  const haunt: Haunt = { qid: "Q1", name: "X", at: NOW.toISOString() };
  it("never gates a link someone sent", () => {
    expect(gateState({ shareLink: true, urlCemetery: null, haunt: null })).toBe("open");
    expect(gateState({ shareLink: true, urlCemetery: null, haunt: undefined })).toBe("open");
  });
  it("opens for a cemetery in the address, with or without a haunt", () => {
    expect(gateState({ shareLink: false, urlCemetery: { qid: "Q2" }, haunt: null })).toBe("open");
    expect(gateState({ shareLink: false, urlCemetery: { qid: "Q2" }, haunt: undefined })).toBe("open");
  });
  it("otherwise follows the haunt, and waits while it's unknown", () => {
    expect(gateState({ shareLink: false, urlCemetery: null, haunt })).toBe("open");
    expect(gateState({ shareLink: false, urlCemetery: null, haunt: null })).toBe("pick");
    expect(gateState({ shareLink: false, urlCemetery: null, haunt: undefined })).toBe("unknown");
  });
  it("spots share parameters", () => {
    expect(isShareLink(params("seance=KXMPRT&cemetery=Q1"), ["seance"])).toBe(true);
    expect(isShareLink(params("party="), ["party"])).toBe(true);
    expect(isShareLink(params("cemetery=Q1"), ["seance", "party"])).toBe(false);
  });
});

describe("links", () => {
  it("carries the cemetery to a tool", () => {
    expect(cemeteryQuery({ qid: "Q872253", name: "Lake View Cemetery", place: "Seattle" })).toBe(
      "cemetery=Q872253&name=Lake+View+Cemetery&place=Seattle",
    );
    expect(cemeteryQuery({ qid: "Q872253", name: "Lake View Cemetery" }, false)).toBe("cemetery=Q872253");
    expect(hubHref({ qid: "Q2008469" })).toBe("/cemetery/Q2008469");
  });
});
