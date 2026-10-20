// Respect rules (PLAN.md decision 5). Every lane that shows a person or speaks a
// name goes through these, so the thresholds live in one place.

import type { Person } from "./types";

/** Only people who died this many years ago or more feed the spirit box. */
export const SPIRIT_MIN_YEARS = 75;
/** Deaths more recent than this get the plain card: no spooky effects. */
export const RECENT_DEATH_YEARS = 25;

export function deathYear(p: Pick<Person, "death">): number | null {
  if (!p.death) return null;
  // Wikidata years can carry a sign ("+1859-..." or "-0044-...").
  const m = p.death.match(/^([+-]?\d{1,4})-/);
  return m ? Number(m[1]) : null;
}

export function yearsSinceDeath(p: Pick<Person, "death">, now = new Date()): number | null {
  const y = deathYear(p);
  return y === null ? null : now.getUTCFullYear() - y;
}

/** True only when we know they died at least 75 years ago. Unknown → false. */
export function spiritEligible(p: Pick<Person, "death">, now = new Date()): boolean {
  const years = yearsSinceDeath(p, now);
  return years !== null && years >= SPIRIT_MIN_YEARS;
}

/** True when the death is recent, or when we don't know when they died. */
export function needsRespectfulStyle(p: Pick<Person, "death">, now = new Date()): boolean {
  const years = yearsSinceDeath(p, now);
  return years === null || years < RECENT_DEATH_YEARS;
}
