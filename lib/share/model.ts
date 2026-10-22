// What a share page and its cards say, built from the tour's own data. Pure:
// the landing page, the metadata, both images and the tests use the same
// model, so they always agree.
//
// Respect rules (lib/respect.ts, decision 5), applied here once:
// - A person who died within 25 years, or whose death date is unknown, gets
//   the plain card: no ornaments, no glyph pair, long-form dates.
// - A tour card's three names leave out anyone who needs the plain card.
// - Séance and party cards never carry a person's name.
// - Nothing here says anything spooky about a real person.

import { needsRespectfulStyle } from "@/lib/respect";
import { formatAge, ageAtDeath, formatWikiDate, parseWikiDate, type WikiDate } from "@/lib/tour/dates";
import { rankPeople, type Scored } from "@/lib/tour/score";
import { cleanExtract, isQidName, nameFromWikiTitle } from "@/lib/tour/text";
import type { Cemetery, Person } from "@/lib/types";

/** The death sign and the life sign at a carved card's apex (the same pairs as the tour's story card). */
export type GlyphName = "hourglass-sprout" | "fern" | "candle" | "poppy" | "moth" | "lily" | "ringed-moon";
export type GlyphPair = { death: GlyphName; life: GlyphName };

export function glyphPairFor(tagIds: string[]): GlyphPair {
  if (tagIds.includes("century-gone")) return { death: "hourglass-sprout", life: "fern" };
  if (tagIds.includes("died-young")) return { death: "candle", life: "poppy" };
  if (tagIds.includes("long-life")) return { death: "moth", life: "lily" };
  return { death: "ringed-moon", life: "lily" };
}

export type CemeteryLabel = { qid: string; name: string; place: string | null };

export type StopCard = {
  kind: "stop";
  /** The respectful plain card (recent or unknown death). */
  plain: boolean;
  personQid: string;
  name: string;
  /** "Nov 8, 1900 – Aug 16, 1949" on a carved card; long months on a plain one. */
  dates: string | null;
  /** "aged 48", "aged about 70". */
  age: string | null;
  description: string | null;
  /** Rank on the tour's "Greatest hits" and the size of the list: "STOP 01 / 80". */
  stop: number;
  total: number;
  glyphs: GlyphPair | null;
  /** The first paragraph of the Wikipedia intro, for the landing page (never on a card). */
  lead: string | null;
  wikipediaUrl: string | null;
  cemetery: CemeteryLabel;
};

export type TourName = { name: string; years: string | null };

export type TourCard = {
  kind: "tour";
  cemetery: CemeteryLabel;
  /** People on the tour's list. */
  people: number;
  /** The first three on "Greatest hits" who don't need the plain card. */
  top: TourName[];
};

export type RoomCard = {
  kind: "seance" | "party";
  room: string;
  /**
   * Null when Wikidata couldn't name it, lists no one buried there, or says it
   * isn't a cemetery (K1: the tour's loader answers not-found for a mausoleum
   * or a person, so a forged link never names one).
   */
  cemetery: CemeteryLabel | null;
};

export type ShareCard = StopCard | TourCard | RoomCard;

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 8, 1900": a carved card's inscription keeps both dates on one line. */
export function shortDate(d: WikiDate | null): string | null {
  const long = formatWikiDate(d);
  if (!d || !long) return null;
  if (d.precision >= 10 && d.month >= 1 && d.month <= 12) return long.replace(/^\w+/, SHORT_MONTHS[d.month - 1]);
  return long;
}

export function lifeLine(birth: string | null, death: string | null): string | null {
  if (birth && death) return `${birth} – ${death}`;
  if (death) return `Died ${death}`;
  if (birth) return `Born ${birth}`;
  return null;
}

/** "1900–1949", "died 1949", or null. */
export function yearsLine(p: Pick<Person, "birth" | "birthPrecision" | "death" | "deathPrecision">): string | null {
  const b = parseWikiDate(p.birth, p.birthPrecision);
  const d = parseWikiDate(p.death, p.deathPrecision);
  const year = (w: WikiDate | null) => (w && w.precision >= 9 ? formatWikiDate({ ...w, precision: 9 }) : null);
  const by = year(b);
  const dy = year(d);
  if (by && dy) return `${by}–${dy}`;
  if (dy) return `died ${dy}`;
  return null;
}

/** A cemetery's name as people know it: never a bare QID. */
export function cemeteryLabel(c: Pick<Cemetery, "qid" | "name" | "locatedIn" | "enwiki">): CemeteryLabel {
  let name = c.name;
  if (isQidName(name)) {
    const title = c.enwiki ? decodeURIComponent(c.enwiki.replace(/^.*\/wiki\//, "")) : null;
    name = nameFromWikiTitle(title) ?? "This cemetery";
  }
  return { qid: c.qid, name, place: c.locatedIn?.trim() || null };
}

function firstParagraph(text: string | null | undefined): string | null {
  const para = cleanExtract(text ?? "")
    .split(/\n+/)
    .map((s) => s.trim())
    .find(Boolean);
  return para ?? null;
}

/** The stop card for one person on a cemetery's tour, or null if Wikidata doesn't list them there. */
export function stopCard(cemetery: Cemetery, people: Person[], personQid: string, now: Date): StopCard | null {
  const ranked: Scored[] = rankPeople(people, { now, cemeteryName: cemetery.name });
  const i = ranked.findIndex((s) => s.person.qid === personQid);
  if (i < 0) return null;
  const { person: p, tags } = ranked[i];
  const plain = needsRespectfulStyle(p, now);
  const birth = parseWikiDate(p.birth, p.birthPrecision);
  const death = parseWikiDate(p.death, p.deathPrecision);
  return {
    kind: "stop",
    plain,
    personQid: p.qid,
    name: p.name,
    dates: plain ? lifeLine(formatWikiDate(birth), formatWikiDate(death)) : lifeLine(shortDate(birth), shortDate(death)),
    age: formatAge(ageAtDeath(birth, death)),
    description: p.description?.trim() || null,
    stop: i + 1,
    total: ranked.length,
    glyphs: plain ? null : glyphPairFor(tags.map((t) => t.id)),
    lead: firstParagraph(p.wikipedia?.extract),
    wikipediaUrl: p.wikipedia?.url ?? null,
    cemetery: cemeteryLabel(cemetery),
  };
}

export const TOUR_TOP = 3;

/** The tour card, or null when Wikidata lists no one buried there (nothing to tour, and maybe not a cemetery). */
export function tourCard(cemetery: Cemetery, people: Person[], now: Date): TourCard | null {
  if (people.length === 0) return null;
  const top = rankPeople(people, { now, cemeteryName: cemetery.name })
    .filter((s) => !needsRespectfulStyle(s.person, now))
    .slice(0, TOUR_TOP)
    .map((s) => ({ name: s.person.name, years: yearsLine(s.person) }));
  return { kind: "tour", cemetery: cemeteryLabel(cemetery), people: people.length, top };
}

/** A séance or party card: the room code and, when it is a cemetery with burials listed, the cemetery. */
export function roomCard(kind: "seance" | "party", room: string, cemetery: Cemetery | null, people: Person[]): RoomCard {
  return { kind, room, cemetery: cemetery && people.length > 0 ? cemeteryLabel(cemetery) : null };
}

// ---------------------------------------------------------------- words

/** "Atlanta" or null: the place line under a cemetery's name. */
export function placeOf(c: CemeteryLabel | null): string | null {
  return c?.place ?? null;
}

export function peopleListed(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"} listed`;
}

/** "Margaret Mitchell, Bobby Jones and Joel Chandler Harris". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The page title (the layout adds " · Between Two Tombstones"). */
export function shareTitle(card: ShareCard): string {
  switch (card.kind) {
    case "stop":
      return `${card.name}, ${card.cemetery.name}`;
    case "tour":
      return `A tour of ${card.cemetery.name}`;
    case "seance":
      return card.cemetery ? `Séance at ${card.cemetery.name}` : "Séance";
    case "party":
      return card.cemetery ? `Graveyard party at ${card.cemetery.name}` : "Graveyard party";
  }
}

/** One or two plain sentences for the description and the unfurl. */
export function shareDescription(card: ShareCard): string {
  switch (card.kind) {
    case "stop": {
      const facts = [card.dates, card.age].filter(Boolean).join(", ");
      const who = facts ? `${card.name} (${facts}).` : `${card.name}.`;
      const where = card.cemetery.place ? `${card.cemetery.name}, ${card.cemetery.place}` : card.cemetery.name;
      return `${who} Stop ${card.stop} of ${card.total} on the tour of ${where}, from Wikidata and Wikipedia.`;
    }
    case "tour": {
      const where = card.cemetery.place ? `${card.cemetery.name}, ${card.cemetery.place}` : card.cemetery.name;
      const who = card.top.length ? ` Including ${listNames(card.top.map((t) => t.name))}.` : "";
      return `A walking tour of ${where}: ${peopleListed(card.people)}, with their stories from Wikipedia.${who}`;
    }
    case "seance":
      return `Room code ${card.room}. Every phone that joins speaks the same names at the same second${
        card.cemetery ? `, from ${card.cemetery.name}` : ""
      }. Only people who died at least 75 years ago are used.`;
    case "party":
      return `Room code ${card.room}. Everyone who joins plays Tombstone Bingo on the same card${
        card.cemetery ? ` at ${card.cemetery.name}` : ""
      }.`;
  }
}

/** The share sheet's text (the link itself goes in `url`). */
export function shareSheetText(card: ShareCard): string {
  switch (card.kind) {
    case "stop":
      return `${card.name}${card.dates ? ` (${card.dates})` : ""}, at ${card.cemetery.name}.`;
    case "tour":
      return `A tour of ${card.cemetery.name}: ${peopleListed(card.people)}.`;
    case "seance":
      return card.cemetery ? `Join my séance at ${card.cemetery.name}. Room code ${card.room}.` : `Join my séance. Room code ${card.room}.`;
    case "party":
      return card.cemetery
        ? `Join my graveyard party at ${card.cemetery.name}. Room code ${card.room}.`
        : `Join my graveyard party. Room code ${card.room}.`;
  }
}

/** The landing page's one call to action. */
export function ctaLabel(kind: ShareCard["kind"], cemeteryName: string | null): string {
  switch (kind) {
    case "stop":
    case "tour":
      return cemeteryName ? `Open the tour at ${cemeteryName}` : "Open the tour";
    case "seance":
      return "Join the séance";
    case "party":
      return "Join the party";
  }
}
