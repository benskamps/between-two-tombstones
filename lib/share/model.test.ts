import { describe, expect, it } from "vitest";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import sleepyHollow from "@/data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot, Person } from "@/lib/types";
import { needsRespectfulStyle } from "@/lib/respect";
import { cemeteryLabel, ctaLabel, glyphPairFor, roomCard, shareDescription, shareSheetText, shareTitle, stopCard, tourCard, type ShareCard } from "./model";

const OAK = oakland as CemeterySnapshot;
const SH = sleepyHollow as CemeterySnapshot;
const NOW = new Date("2026-10-21T00:00:00Z");
const MITCHELL = "Q173540"; // d. 1949
const JACKSON = "Q3302990"; // d. 2003: within 25 years
const DOOLY = "Q98732878"; // no dates on Wikidata

/** Every word a card can show, flattened. */
function words(card: ShareCard): string {
  return [shareTitle(card), shareDescription(card), shareSheetText(card), JSON.stringify(card)].join(" ");
}

describe("stop card", () => {
  it("an old grave gets the carved card: glyph pair, short dates, the age, its place on the tour", () => {
    const c = stopCard(OAK.cemetery, OAK.people, MITCHELL, NOW)!;
    expect(c).toMatchObject({
      kind: "stop",
      plain: false,
      name: "Margaret Mitchell",
      dates: "Nov 8, 1900 – Aug 16, 1949",
      age: "aged 48",
      stop: 1,
      total: OAK.people.length,
      cemetery: { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" },
    });
    expect(c.glyphs).not.toBeNull();
    expect(c.lead).toMatch(/^Margaret Munnerlyn Mitchell/);
    expect(c.wikipediaUrl).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\//);
  });

  it("a death within 25 years gets the plain card: no glyphs, long-form dates", () => {
    const c = stopCard(OAK.cemetery, OAK.people, JACKSON, NOW)!;
    expect(c.plain).toBe(true);
    expect(c.glyphs).toBeNull();
    expect(c.dates).toBe("March 23, 1938 – June 24, 2003");
  });

  it("an unknown death date gets the plain card too", () => {
    const c = stopCard(OAK.cemetery, OAK.people, DOOLY, NOW)!;
    expect(c.plain).toBe(true);
    expect(c.glyphs).toBeNull();
    expect(c.dates).toBeNull();
  });

  it("every stop's plain flag follows lib/respect.ts", () => {
    for (const p of OAK.people) {
      const c = stopCard(OAK.cemetery, OAK.people, p.qid, NOW)!;
      expect(c.plain, p.name).toBe(needsRespectfulStyle(p, NOW));
      expect(c.glyphs === null, p.name).toBe(c.plain);
    }
  });

  it("is null for someone Wikidata doesn't list at that cemetery", () => {
    expect(stopCard(OAK.cemetery, OAK.people, "Q42", NOW)).toBeNull();
    expect(stopCard(SH.cemetery, SH.people, MITCHELL, NOW)).toBeNull();
  });
});

describe("tour card", () => {
  it("names the cemetery, how many people, and the first three who don't need the plain card", () => {
    const c = tourCard(OAK.cemetery, OAK.people, NOW)!;
    expect(c.people).toBe(OAK.people.length);
    expect(c.top).toHaveLength(3);
    expect(c.top[0]).toEqual({ name: "Margaret Mitchell", years: "1900–1949" });
    const byName = new Map(OAK.people.map((p) => [p.name, p]));
    for (const t of c.top) expect(needsRespectfulStyle(byName.get(t.name)!, NOW), t.name).toBe(false);
  });

  it("leaves recent deaths out even when they'd rank first", () => {
    const recent: Person = { ...OAK.people.find((p) => p.qid === MITCHELL)!, qid: "Q999999", name: "A Recent Person", death: "2020-01-01T00:00:00Z", sitelinks: 500 };
    const c = tourCard(OAK.cemetery, [recent, ...OAK.people], NOW)!;
    expect(c.top.map((t) => t.name)).not.toContain("A Recent Person");
  });

  it("is null when Wikidata lists no one there (nothing to tour, and maybe not a cemetery)", () => {
    expect(tourCard(OAK.cemetery, [], NOW)).toBeNull();
  });
});

describe("séance and party cards", () => {
  it("carry the room code and the cemetery, never a person's name", () => {
    for (const kind of ["seance", "party"] as const) {
      const c = roomCard(kind, "KXMPRT", OAK.cemetery, OAK.people);
      expect(c).toEqual({ kind, room: "KXMPRT", cemetery: { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" } });
      const text = words(c);
      for (const p of OAK.people) expect(text.includes(p.name), `${kind} card names ${p.name}`).toBe(false);
    }
  });

  it("don't name a place Wikidata lists no burials at (it might be a person's item)", () => {
    const personAsCemetery = { ...OAK.cemetery, qid: "Q173540", name: "Margaret Mitchell" };
    expect(roomCard("seance", "KXMPRT", personAsCemetery, []).cemetery).toBeNull();
    expect(words(roomCard("seance", "KXMPRT", personAsCemetery, []))).not.toContain("Margaret Mitchell");
  });
});

describe("words", () => {
  it("say nothing spooky about a real person", () => {
    const spooky = /haunt|ghost|spirit|spook|séance|seance|curse|undead|zombie|creep/i;
    for (const p of OAK.people) {
      const c = stopCard(OAK.cemetery, OAK.people, p.qid, NOW)!;
      const text = [shareTitle(c), shareDescription(c), shareSheetText(c), c.name, c.dates, c.age].join(" ");
      expect(text, p.name).not.toMatch(spooky);
    }
    expect([shareTitle(tourCard(OAK.cemetery, OAK.people, NOW)!), shareDescription(tourCard(OAK.cemetery, OAK.people, NOW)!)].join(" ")).not.toMatch(spooky);
  });

  it("one call to action per kind", () => {
    expect(ctaLabel("stop", "Oakland Cemetery")).toBe("Open the tour at Oakland Cemetery");
    expect(ctaLabel("tour", null)).toBe("Open the tour");
    expect(ctaLabel("seance", "Oakland Cemetery")).toBe("Join the séance");
    expect(ctaLabel("party", null)).toBe("Join the party");
  });

  it("never shows a bare QID as a cemetery's name", () => {
    expect(cemeteryLabel({ qid: "Q1", name: "Q1", locatedIn: null, enwiki: "https://en.wikipedia.org/wiki/Oakland_Cemetery_(Atlanta)" }).name).toBe("Oakland Cemetery");
    expect(cemeteryLabel({ qid: "Q1", name: "Q1", locatedIn: " ", enwiki: null })).toEqual({ qid: "Q1", name: "This cemetery", place: null });
  });

  it("uses the tour's glyph pairs", () => {
    expect(glyphPairFor(["century-gone", "died-young"])).toEqual({ death: "hourglass-sprout", life: "fern" });
    expect(glyphPairFor(["died-young"])).toEqual({ death: "candle", life: "poppy" });
    expect(glyphPairFor(["long-life"])).toEqual({ death: "moth", life: "lily" });
    expect(glyphPairFor([])).toEqual({ death: "ringed-moon", life: "lily" });
  });
});
