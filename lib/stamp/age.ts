// Age at death for the postage stamp's denomination.

import { ageAtDeathYears, compareYMD, isValidYMD, type YMD } from "@/lib/stonemath";

/** The last plausible four-digit year (1000–2099) in free text like "Apr 3, 1783" or "1783". */
export function extractYear(text: string): number | null {
  const years = text.match(/\b(1\d{3}|20\d{2})\b/g);
  if (!years) return null;
  return Number(years[years.length - 1]);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthIndex(word: string): number | null {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return i >= 0 ? i + 1 : null;
}

/**
 * A full date from free text, or null when the day or month is missing:
 * "April 3, 1783", "Nov. 28, 1859", "3 April 1783", "1859-11-28", "11/28/1859" (US order).
 */
export function parseFullDate(text: string): YMD | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let date: YMD | null = m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  if (!date && (m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) date = { y: +m[3], m: +m[1], d: +m[2] };
  if (!date && (m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const mo = monthIndex(m[1]);
    if (mo) date = { y: +m[3], m: mo, d: +m[2] };
  }
  if (!date && (m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s+(\d{4})$/))) {
    const mo = monthIndex(m[2]);
    if (mo) date = { y: +m[3], m: mo, d: +m[1] };
  }
  return date && isValidYMD(date) ? date : null;
}

/**
 * Age at death from what the user typed in "Born" and "Died". Two full dates
 * give the exact age the stonecutter would carve (lib/stonemath); otherwise it
 * falls back to whole years from the two years, which can be one too high when
 * the birthday hadn't come round yet in the year of death.
 */
export function ageFromDates(born: string, died: string): number | null {
  const bFull = parseFullDate(born);
  const dFull = parseFullDate(died);
  if (bFull && dFull) {
    if (compareYMD(dFull, bFull) < 0) return null;
    const age = ageAtDeathYears(bFull, dFull);
    return age <= 130 ? age : null;
  }
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
