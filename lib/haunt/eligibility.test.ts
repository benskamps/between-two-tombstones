import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { selectPeople } from "@/lib/calendar/feed";
import { spiritEligible } from "@/lib/respect";
import type { CemeterySnapshot } from "@/lib/types";
import { countEligible } from "./eligibility";

const NOW = new Date("2026-10-21T12:00:00Z");
const snap = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../data/snapshots/${file}`, import.meta.url)), "utf8")) as CemeterySnapshot;

describe("countEligible", () => {
  for (const file of ["oakland-atlanta.json", "sleepy-hollow.json"]) {
    it(`${file}: agrees with the spirit box's and the calendar's own rules`, () => {
      const { people } = snap(file);
      const got = countEligible(people, NOW);
      expect(got.spirit).toBe(people.filter((p) => spiritEligible(p, NOW)).length);
      expect(got.calendar).toBe(selectPeople(people, { kinds: ["death"], limit: Number.MAX_SAFE_INTEGER, now: NOW }).length);
      expect(got.spirit).toBeGreaterThan(0);
      expect(got.calendar).toBeGreaterThan(0);
    });
  }

  it("a modern cemetery has nobody for the spirit box or the calendar", () => {
    const people = [
      { death: "2005-05-02T00:00:00Z", deathPrecision: 11 },
      { death: "1990-01-01T00:00:00Z", deathPrecision: 9 },
      { death: null, deathPrecision: null },
    ];
    expect(countEligible(people, NOW)).toEqual({ spirit: 0, calendar: 0 });
  });

  it("someone dead 50 years with a full date counts for the calendar only", () => {
    expect(countEligible([{ death: "1976-03-04T00:00:00Z", deathPrecision: 11 }], NOW)).toEqual({ spirit: 0, calendar: 1 });
  });
});
