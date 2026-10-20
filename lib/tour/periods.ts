// "Died during": wars and pandemics whose dates are well established. These
// lines state timing only ("Died during the 1918 flu pandemic"), never cause.
// A death date counts only when its whole precision window sits inside the
// period: a death known only as "1865" is not "during the Civil War", because
// the war ended in April and we can't tell.
//
// Dates (start – end), from the standard accounts of each:
// - American Revolutionary War: April 19, 1775 (Lexington and Concord) –
//   September 3, 1783 (Treaty of Paris).
// - American Civil War: April 12, 1861 (Fort Sumter) – May 26, 1865 (last
//   major Confederate army surrenders; the commonly cited end).
// - World War I: July 28, 1914 – November 11, 1918 (Armistice).
// - 1918 flu pandemic: February 1918 – April 1920.
// - World War II: September 1, 1939 – September 2, 1945.

import { dateRange, keyOf, parseWikiDate } from "./dates";

export type Period = { id: string; label: string; start: number; end: number };

export const PERIODS: Period[] = [
  { id: "us-revolution", label: "the American Revolutionary War", start: keyOf(1775, 4, 19), end: keyOf(1783, 9, 3) },
  { id: "us-civil-war", label: "the American Civil War", start: keyOf(1861, 4, 12), end: keyOf(1865, 5, 26) },
  { id: "ww1", label: "World War I", start: keyOf(1914, 7, 28), end: keyOf(1918, 11, 11) },
  { id: "flu-1918", label: "the 1918 flu pandemic", start: keyOf(1918, 2, 1), end: keyOf(1920, 4, 30) },
  { id: "ww2", label: "World War II", start: keyOf(1939, 9, 1), end: keyOf(1945, 9, 2) },
];

/** Periods the death falls inside, as display lines ("Died during World War I"). */
export function diedDuring(death: string | null, deathPrecision: number | null): string[] {
  const d = parseWikiDate(death, deathPrecision);
  if (!d || d.precision < 9) return [];
  const [from, to] = dateRange(d);
  return PERIODS.filter((p) => from >= p.start && to <= p.end).map((p) => `Died during ${p.label}`);
}
