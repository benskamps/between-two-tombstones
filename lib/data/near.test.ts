import { describe, expect, it } from "vitest";
import charlestonJson from "./__fixtures__/sparql-near-charleston.json";
import lakeViewJson from "./__fixtures__/sparql-near-lakeview.json";
import oaklandJson from "./__fixtures__/sparql-near-oakland.json";
import {
  accuracyText,
  autoOpenTarget,
  bestNearby,
  distanceText,
  hereHref,
  isApproximate,
  nearHref,
  parseAccuracy,
  parseFlag,
  peopleText,
  splitNear,
} from "./near";
import type { NearbyCemetery } from "./types";
import { flattenBindings, parseNearRows } from "./wikidata";

// Recorded live 10/21 at the review's two Gate 2 points.
const charleston = parseNearRows(flattenBindings(charlestonJson)); // 32.804, -79.947: 1.7 km from Magnolia
const oakland = parseNearRows(flattenBindings(oaklandJson)); // 33.749, -84.372: inside Oakland Cemetery

const c = (qid: string, distanceKm: number, burials: number): NearbyCemetery => ({
  qid,
  name: qid,
  description: null,
  locatedIn: null,
  coord: null,
  findAGraveCemeteryId: null,
  enwiki: null,
  distanceKm,
  burials,
});

describe("best stories nearby (F2)", () => {
  it("pins Magnolia Cemetery at the Charleston point, where 30 nearer churchyards list 0–4 people", () => {
    const magnoliaRank = charleston.findIndex((x) => x.name === "Magnolia Cemetery");
    expect(magnoliaRank).toBeGreaterThanOrEqual(20); // nearest-first buries it
    expect(charleston.slice(0, magnoliaRank).every((x) => x.burials < 5)).toBe(true);
    expect(bestNearby(charleston)).toMatchObject({ qid: "Q12061438", name: "Magnolia Cemetery" });
  });

  it("pins Oakland Cemetery when standing in it", () => {
    expect(bestNearby(oakland)).toMatchObject({ qid: "Q2008469", name: "Oakland Cemetery" });
  });

  it("prefers 10+ within 2 km, else the nearest with 5+, else nothing", () => {
    expect(bestNearby([c("Q1", 0.5, 7), c("Q2", 1.9, 12), c("Q3", 0.1, 3)])?.qid).toBe("Q2");
    expect(bestNearby([c("Q1", 0.5, 7), c("Q2", 2.5, 40)])?.qid).toBe("Q1");
    expect(bestNearby([c("Q2", 2.5, 40), c("Q1", 4, 6)])?.qid).toBe("Q2");
    expect(bestNearby([c("Q1", 0.2, 4), c("Q2", 1, 0)])).toBeNull();
    expect(bestNearby([])).toBeNull();
    // Lake View (Seattle) still wins at its own point.
    expect(bestNearby(parseNearRows(flattenBindings(lakeViewJson)))?.name).toBe("Lake View Cemetery");
  });

  it("folds the cemeteries with no one listed and keeps the rest as links, nearest first", () => {
    const best = bestNearby(charleston);
    const { listed, unlisted } = splitNear(charleston, best);
    expect(listed.some((x) => x.qid === best!.qid) || unlisted.some((x) => x.qid === best!.qid)).toBe(false);
    expect(listed.every((x) => x.burials > 0)).toBe(true);
    expect(unlisted.every((x) => x.burials === 0)).toBe(true);
    expect(listed.length + unlisted.length + 1).toBe(charleston.length);
    expect(unlisted.length).toBeGreaterThan(20);
    for (const part of [listed, unlisted]) for (let i = 1; i < part.length; i++) expect(part[i].distanceKm).toBeGreaterThanOrEqual(part[i - 1].distanceKm);
    expect(splitNear([c("Q1", 1, 0)], null)).toEqual({ listed: [], unlisted: [c("Q1", 1, 0)] });
  });
});

describe("auto-open for \"I'm here. Haunt me.\" (F2c, F17)", () => {
  it("opens Oakland straight away with a good fix", () => {
    expect(autoOpenTarget(oakland, 20)?.qid).toBe("Q2008469");
    expect(autoOpenTarget(oakland, 300)?.qid).toBe("Q2008469");
  });

  it("never auto-opens without acc, with a fix worse than ±300 m, or with list=1", () => {
    expect(autoOpenTarget(oakland, null)).toBeNull();
    expect(autoOpenTarget(oakland, 301)).toBeNull();
    expect(autoOpenTarget(oakland, 1200)).toBeNull();
    expect(autoOpenTarget(oakland, 20, true)).toBeNull();
  });

  it("needs 5+ people within about 300 m (nothing qualifies at the Charleston point)", () => {
    expect(autoOpenTarget(charleston, 10)).toBeNull();
    expect(autoOpenTarget([c("Q1", 0.31, 50)], 10)).toBeNull();
    expect(autoOpenTarget([c("Q1", 0.1, 4), c("Q2", 0.3, 5)], 10)?.qid).toBe("Q2");
    expect(autoOpenTarget([c("Q2", 0.25, 9), c("Q1", 0.05, 6)], 10)?.qid).toBe("Q1");
  });
});

describe("URL params and text", () => {
  it("reads acc as meters; anything else is unknown", () => {
    expect(parseAccuracy("12")).toBe(12);
    expect(parseAccuracy(" 1234.5 ")).toBe(1234.5);
    expect(parseAccuracy("0")).toBe(0);
    for (const bad of [undefined, null, "", "-5", "abc", "1e3", "12m", "Infinity", "99999999"]) expect(parseAccuracy(bad), String(bad)).toBeNull();
  });

  it("reads list=1", () => {
    expect(parseFlag("1")).toBe(true);
    expect(parseFlag("true")).toBe(true);
    for (const no of [undefined, null, "", "0", "no"]) expect(parseFlag(no)).toBe(false);
  });

  it("says how approximate a location is, rounded sensibly", () => {
    expect(accuracyText(1234)).toBe("±1.2 km");
    expect(accuracyText(1000)).toBe("±1 km");
    expect(accuracyText(996)).toBe("±1 km");
    expect(accuracyText(347)).toBe("±350 m");
    expect(accuracyText(301)).toBe("±300 m");
    expect(accuracyText(15_400)).toBe("±15 km");
    expect(accuracyText(9_960)).toBe("±10 km");
    expect(isApproximate(301)).toBe(true);
    expect(isApproximate(300)).toBe(false);
    expect(isApproximate(null)).toBe(false);
  });

  it("builds the contract URLs", () => {
    expect(nearHref("Q2008469")).toBe("/cemetery/Q2008469?via=near");
    expect(hereHref("Q2008469", 33.7489, -84.3718)).toBe("/cemetery/Q2008469?via=here&lat=33.7489&lon=-84.3718");
  });

  it("formats distance and people like the other lists", () => {
    expect(distanceText(0.069)).toBe("70 m away");
    expect(distanceText(1.655)).toBe("1.7 km away");
    expect(peopleText(1)).toBe("1 person listed on Wikidata");
    expect(peopleText(102)).toBe("102 people listed on Wikidata");
  });
});
