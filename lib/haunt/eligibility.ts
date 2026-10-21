// Which haunt tools have anyone to work with (F14), by the same respect rules
// the tools use (lib/respect.ts): the spirit box and séance speak only people
// dead 75+ years; the calendar takes people dead 25+ years with a death date
// known to the day.

import { needsRespectfulStyle, spiritEligible } from "@/lib/respect";
import type { Person } from "@/lib/types";

const DAY_PRECISION = 11;
const ISO_DAY = /^[+]?\d{4}-\d{2}-\d{2}/;

export type Eligible = { spirit: number; calendar: number };

export function countEligible(people: Pick<Person, "death" | "deathPrecision">[], now: Date = new Date()): Eligible {
  let spirit = 0;
  let calendar = 0;
  for (const p of people) {
    if (spiritEligible(p, now)) spirit += 1;
    if (!needsRespectfulStyle(p, now) && p.deathPrecision === DAY_PRECISION && ISO_DAY.test(p.death ?? "")) calendar += 1;
  }
  return { spirit, calendar };
}
