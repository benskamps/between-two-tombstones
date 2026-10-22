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

/** A death date with its Wikidata precision (11 day, 10 month, 9 year, 8 decade, 7 century, 6 millennium). */
type Death = Pick<Person, "death"> & { deathPrecision?: number | null };

/**
 * The latest year the death could fall in. A "1950s" death is stored as 1950 with
 * decade precision, so counting from 1950 would call it 76 years ago in 2026 and let
 * someone who died in 1959 into the spirit box. Coarse dates round up past the end of
 * their span (one year past, to cover either way Wikidata stores the span); anything
 * coarser than a millennium counts as unknown. No precision is read as a plain year.
 */
export function latestDeathYear(p: Death): number | null {
  const y = deathYear(p);
  const precision = p.deathPrecision ?? 9;
  if (y === null || precision >= 9) return y;
  if (precision === 8) return Math.floor(y / 10) * 10 + 10;
  if (precision === 7) return Math.floor(y / 100) * 100 + 100;
  if (precision === 6) return Math.floor(y / 1000) * 1000 + 1000;
  return null;
}

/** Years since the latest year the death could fall in: the safe side of both rules below. */
export function yearsSinceDeath(p: Death, now = new Date()): number | null {
  const y = latestDeathYear(p);
  return y === null ? null : now.getUTCFullYear() - y;
}

/** True only when we know they died at least 75 years ago. Unknown → false. */
export function spiritEligible(p: Death, now = new Date()): boolean {
  const years = yearsSinceDeath(p, now);
  return years !== null && years >= SPIRIT_MIN_YEARS;
}

/** True when the death is recent, or when we don't know when they died. */
export function needsRespectfulStyle(p: Death, now = new Date()): boolean {
  const years = yearsSinceDeath(p, now);
  return years === null || years < RECENT_DEATH_YEARS;
}
