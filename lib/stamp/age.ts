// Age at death for the postage stamp's denomination.

/** The last plausible four-digit year (1000–2099) in free text like "Apr 3, 1783" or "1783". */
export function extractYear(text: string): number | null {
  const years = text.match(/\b(1\d{3}|20\d{2})\b/g);
  if (!years) return null;
  return Number(years[years.length - 1]);
}

/**
 * Age at death from what the user typed in "Born" and "Died".
 *
 * TODO(orchestrator): wire `ageFromDates` to Lane 3a's `lib/stonemath` once it
 * merges, so full dates give the exact age (Irving: Apr 3 1783 – Nov 28 1859 =
 * 76). Until then this is whole years from two typed years, which can be one
 * too high when the birthday hadn't come round yet in the year of death.
 */
export function ageFromDates(born: string, died: string): number | null {
  const b = extractYear(born);
  const d = extractYear(died);
  if (b === null || d === null) return null;
  const age = d - b;
  return age >= 0 && age <= 130 ? age : null;
}

/** "1783 – 1859", "Born 1783", "Died 1859" or "" from the two fields. */
export function datesLine(born: string, died: string): string {
  const b = born.trim();
  const d = died.trim();
  if (b && d) return `${b} – ${d}`;
  if (b) return `Born ${b}`;
  if (d) return `Died ${d}`;
  return "";
}
