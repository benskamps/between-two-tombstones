import { describe, expect, it } from "vitest";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import sleepyHollow from "@/data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot, Person } from "@/lib/types";
import { hasUnusualDeath, rankPeople, scorePerson, WEIGHTS, type TagId } from "./score";

const now = new Date("2026-10-20T00:00:00Z");
const oak = oakland as CemeterySnapshot;
const sh = sleepyHollow as CemeterySnapshot;
const person = (snap: CemeterySnapshot, qid: string): Person => {
  const p = snap.people.find((x) => x.qid === qid);
  if (!p) throw new Error(`${qid} not in snapshot`);
  return p;
};
const tagIds = (p: Person, cemeteryName: string | null = null) => scorePerson(p, { now, cemeteryName }).tags.map((t) => t.id);
// The exact P1442 value on Wikidata as of Oct 20 (another woman's stone), pinned
// here so the test holds even after the snapshot is regenerated or Wikidata is fixed.
const MITCHELL_WRONG_GRAVE =
  "http://commons.wikimedia.org/wiki/Special:FilePath/Margaret%20Ann%20Mitchell%20Tombstone%2C%20Hiland%20Cemetery%2C%202015-08-17%2C%2001.jpg";

describe("why this grave: tags", () => {
  it("Margaret Mitchell: famous, unusual death; her 'grave photo' is another cemetery's, so no grave-photo tag", () => {
    const mitchell = { ...person(oak, "Q173540"), graveImage: MITCHELL_WRONG_GRAVE };
    const tags = tagIds(mitchell, "Oakland Cemetery");
    expect(tags).toEqual(expect.arrayContaining<TagId>(["famous", "unusual-death"]));
    expect(tags).not.toContain("grave-photo");
    // Without knowing the cemetery, the photo would count.
    expect(tagIds(mitchell)).toContain("grave-photo");
  });

  it("lived to 95+ (Robert Foster Maddox, April 4, 1870 – April 10, 1965)", () => {
    const maddox = { ...person(oak, "Q7347269"), birth: "1870-04-04T00:00:00Z", birthPrecision: 11, death: "1965-04-10T00:00:00Z", deathPrecision: 11 };
    expect(scorePerson(maddox, { now }).tags).toContainEqual({ id: "long-life", label: "Lived to 95" });
    expect(tagIds({ ...maddox, death: "1964-04-03T00:00:00Z" })).not.toContain("long-life");
  });

  it("died young (< 30)", () => {
    const base = person(oak, "Q173540");
    const young: Person = { ...base, birth: "1900-11-08T00:00:00Z", death: "1925-01-01T00:00:00Z" };
    expect(tagIds(young)).toContain("died-young");
    expect(tagIds(base)).not.toContain("died-young");
  });

  it("gone 100+ years: Washington Irving; not for a 1949 death", () => {
    const irving = sh.people.find((p) => p.name === "Washington Irving")!;
    expect(tagIds(irving)).toContain("century-gone");
    expect(tagIds(person(oak, "Q173540"))).not.toContain("century-gone");
  });

  it("no boost and no tag for suicide (Madame Restell); homicide and accidents count", () => {
    const restell = person(sh, "Q6726328");
    expect(restell.mannersOfDeath).toEqual(["suicide"]);
    expect(hasUnusualDeath(restell)).toBe(false);
    expect(tagIds(restell)).not.toContain("unusual-death");
    const withoutManner = scorePerson({ ...restell, mannersOfDeath: [] }, { now }).score;
    expect(scorePerson(restell, { now }).score).toBe(withoutManner);

    expect(hasUnusualDeath(person(sh, "Q7152003"))).toBe(true); // Paul Leicester Ford, homicide
    expect(hasUnusualDeath(person(sh, "Q4405404"))).toBe(true); // Holbrook Blinn, accidental death
    expect(hasUnusualDeath({ mannersOfDeath: ["natural causes"] })).toBe(false);
    expect(hasUnusualDeath({ mannersOfDeath: ["homicide", "suicide"] })).toBe(false);
  });

  it("recent deaths never get the died-young tag or boost (respect rules)", () => {
    const base: Person = { ...person(oak, "Q173540"), mannersOfDeath: [], graveImage: null, graveCoord: null };
    // Died at 24, five years ago: the plain card, and nothing that singles the death out.
    const recent: Person = { ...base, birth: "1997-03-01T00:00:00Z", birthPrecision: 11, death: "2021-06-01T00:00:00Z", deathPrecision: 11 };
    expect(tagIds(recent)).not.toContain("died-young");
    // The same age at death long ago still gets both.
    const old: Person = { ...recent, birth: "1927-03-01T00:00:00Z", death: "1951-06-01T00:00:00Z" };
    expect(tagIds(old)).toContain("died-young");
    expect(scorePerson(old, { now }).score - scorePerson(recent, { now }).score).toBe(WEIGHTS["died-young"]);
    // Within the 25-year line, at 24 years gone, still no tag.
    expect(tagIds({ ...recent, birth: "1978-01-01T00:00:00Z", death: "2002-01-01T00:00:00Z" })).not.toContain("died-young");
  });

  it("recent deaths never get the unusual-death tag", () => {
    const helmsley = sh.people.find((p) => p.name === "Leona Helmsley")!;
    expect(tagIds({ ...helmsley, mannersOfDeath: ["homicide"] })).not.toContain("unusual-death");
  });

  it("grave photo and grave location", () => {
    const irving = sh.people.find((p) => p.name === "Washington Irving")!;
    expect(tagIds(irving, "Sleepy Hollow Cemetery")).toContain("grave-photo");
    const evans = person(oak, "Q1100228"); // Clement A. Evans has a coordinate
    expect(tagIds(evans)).toContain("grave-located");
  });
});

describe("why this grave: ranking", () => {
  it("Oakland's tour starts with Margaret Mitchell", () => {
    const ranked = rankPeople(oak.people, { now, cemeteryName: oak.cemetery.name });
    expect(ranked[0].person.name).toBe("Margaret Mitchell");
    expect(ranked).toHaveLength(oak.people.length);
  });

  it("puts every person with a story ahead of people without one", () => {
    const people = [...sh.people.slice(0, 5), { ...sh.people[0], qid: "Q1", name: "No Story", wikipedia: null, sitelinks: 500 }];
    const ranked = rankPeople(people, { now });
    expect(ranked[ranked.length - 1].person.name).toBe("No Story");
  });

  it("a story still on its way ranks as if it were in, so the stops don't reorder when it lands", () => {
    const withStories = rankPeople(oak.people, { now, cemeteryName: oak.cemetery.name });
    // Take the stories of stops 5, 9 and 13 away, as if their Wikipedia batch hadn't answered yet.
    const waiting = new Set([4, 8, 12].map((i) => withStories[i].person.qid));
    const partial = oak.people.map((p) => (waiting.has(p.qid) ? { ...p, wikipedia: null } : p));
    const order = (r: ReturnType<typeof rankPeople>) => r.map((s) => s.person.qid);
    expect(order(rankPeople(partial, { now, cemeteryName: oak.cemetery.name, storyPending: waiting }))).toEqual(order(withStories));
    // Without the hint they would drop behind everyone who has a story.
    expect(order(rankPeople(partial, { now, cemeteryName: oak.cemetery.name })).slice(0, 13)).not.toEqual(order(withStories).slice(0, 13));
  });

  it("fame is worth 10 points per doubling of sitelinks", () => {
    const base: Person = { ...sh.people[0], sitelinks: 0, wikipedia: null, graveImage: null, graveCoord: null, mannersOfDeath: [], birth: null, death: null };
    expect(scorePerson({ ...base, sitelinks: 1 }, { now }).score).toBe(WEIGHTS.famePerDoubling);
    expect(scorePerson({ ...base, sitelinks: 3 }, { now }).score).toBe(2 * WEIGHTS.famePerDoubling);
  });
});
