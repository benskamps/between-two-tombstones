import { describe, expect, it } from "vitest";
import { canonicalShareUrl, isShareQid, isShareRoom, parseShare, reportIssueUrl, shareBank, shareCtaHref, sharePath, storyImagePath } from "./links";
import { SITE } from "@/lib/site";

describe("share link segments", () => {
  it("takes QIDs only exactly as Wikidata writes them", () => {
    for (const ok of ["Q1", "Q2008469", "Q131260124"]) expect(isShareQid(ok), ok).toBe(true);
    for (const bad of ["q2008469", "Q0", "Q012", "Q", "2008469", " Q1", "Q1 ", "Q1/", "Q1234567890123", "P31", "Q1.png", null, 7]) {
      expect(isShareQid(bad), String(bad)).toBe(false);
    }
  });

  it("takes room codes only as six upper-case letters from the party alphabet", () => {
    expect(isShareRoom("KXMPRT")).toBe(true);
    for (const bad of ["kxmprt", "KXMPR", "KXMPRTT", "KXMPRI", "KXMPRL", "KXMPRO", "KXM-PRT", "KXMPR1", ""]) expect(isShareRoom(bad), bad).toBe(false);
  });

  it("keeps a bank hash only when it's eight hex digits", () => {
    expect(shareBank("1a2b3c4d")).toBe("1a2b3c4d");
    for (const bad of ["1A2B3C4D", "1a2b3c4", "1a2b3c4d5", "zzzzzzzz", undefined, null, ["1a2b3c4d"]]) expect(shareBank(bad)).toBeNull();
  });

  it("parses each kind and rejects anything malformed", () => {
    expect(parseShare("stop", { cemetery: "Q2008469", person: "Q173540" })).toEqual({ kind: "stop", cemetery: "Q2008469", person: "Q173540" });
    expect(parseShare("tour", { cemetery: "Q2008469" })).toEqual({ kind: "tour", cemetery: "Q2008469" });
    expect(parseShare("seance", { cemetery: "Q2008469", room: "KXMPRT", bank: "1a2b3c4d" })).toEqual({
      kind: "seance",
      cemetery: "Q2008469",
      room: "KXMPRT",
      bank: "1a2b3c4d",
    });
    expect(parseShare("seance", { cemetery: "Q2008469", room: "KXMPRT", bank: "nope" })).toMatchObject({ bank: null });
    expect(parseShare("party", { cemetery: "Q2008469", room: "KXMPRT" })).toEqual({ kind: "party", cemetery: "Q2008469", room: "KXMPRT" });
    expect(parseShare("stop", { cemetery: "Q2008469", person: "q173540" })).toBeNull();
    expect(parseShare("stop", { cemetery: "Q2008469" })).toBeNull();
    expect(parseShare("tour", { cemetery: "Q0" })).toBeNull();
    expect(parseShare("seance", { cemetery: "Q2008469", room: "KXMPRI" })).toBeNull();
    expect(parseShare("party", { cemetery: "x", room: "KXMPRT" })).toBeNull();
  });
});

describe("share paths", () => {
  it("builds short, readable paths that parse back to the same ref", () => {
    expect(sharePath({ kind: "stop", cemetery: "Q2008469", person: "Q173540" })).toBe("/s/stop/Q2008469/Q173540");
    expect(sharePath({ kind: "tour", cemetery: "Q2008469" })).toBe("/s/tour/Q2008469");
    expect(sharePath({ kind: "seance", cemetery: "Q2008469", room: "KXMPRT", bank: "1a2b3c4d" })).toBe("/s/seance/Q2008469/KXMPRT?b=1a2b3c4d");
    expect(sharePath({ kind: "seance", cemetery: "Q2008469", room: "KXMPRT", bank: null })).toBe("/s/seance/Q2008469/KXMPRT");
    expect(sharePath({ kind: "party", cemetery: "Q2008469", room: "KXMPRT" })).toBe("/s/party/Q2008469/KXMPRT");
    expect(storyImagePath({ kind: "seance", cemetery: "Q2008469", room: "KXMPRT", bank: "1a2b3c4d" })).toBe("/s/seance/Q2008469/KXMPRT/story-image");
  });

  it("puts metadata URLs on the canonical origin", () => {
    expect(canonicalShareUrl({ kind: "tour", cemetery: "Q2008469" })).toBe(new URL("/s/tour/Q2008469", SITE.url).toString());
  });

  it("sends the one call to action to the existing, ungated routes", () => {
    expect(shareCtaHref({ kind: "stop", cemetery: "Q2008469", person: "Q173540" }, null)).toBe("/cemetery/Q2008469");
    expect(shareCtaHref({ kind: "tour", cemetery: "Q2008469" }, null)).toBe("/cemetery/Q2008469");
    expect(shareCtaHref({ kind: "seance", cemetery: "Q2008469", room: "KXMPRT", bank: "1a2b3c4d" }, null)).toBe(
      "/spirit?seance=KXMPRT&cemetery=Q2008469&bank=1a2b3c4d",
    );
    expect(shareCtaHref({ kind: "party", cemetery: "Q2008469", room: "KXMPRT" }, { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" })).toBe(
      "/games/bingo?party=KXMPRT&cemetery=Q2008469&name=Oakland+Cemetery&place=Atlanta",
    );
    expect(shareCtaHref({ kind: "party", cemetery: "Q2008469", room: "KXMPRT" }, null)).toBe("/games/bingo?party=KXMPRT");
  });

  it("opens a GitHub issue on the repo with the page's address filled in", () => {
    const url = new URL(reportIssueUrl("https://example.app/s/stop/Q2008469/Q173540"));
    expect(`${url.origin}${url.pathname}`).toBe(`${SITE.repo}/issues/new`);
    expect(url.searchParams.get("body")).toContain("Page: https://example.app/s/stop/Q2008469/Q173540");
    expect(url.searchParams.get("title")).toBe("Report a share page");
  });
});
