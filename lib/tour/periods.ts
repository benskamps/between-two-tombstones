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

export const WORLD_EVENTS: Period[] = [
  { id: "us-declaration", label: "the Declaration of Independence (1776)", start: keyOf(1776, 7, 4), end: keyOf(1776, 7, 4) },
  { id: "telegraph", label: "the first telegraph message (1844)", start: keyOf(1844, 5, 24), end: keyOf(1844, 5, 24) },
  { id: "us-civil-war", label: "the American Civil War (1861–1865)", start: keyOf(1861, 4, 12), end: keyOf(1865, 5, 26) },
  { id: "transcontinental-railroad", label: "the Transcontinental Railroad (1869)", start: keyOf(1869, 5, 10), end: keyOf(1869, 5, 10) },
  { id: "telephone", label: "the first telephone call (1876)", start: keyOf(1876, 3, 10), end: keyOf(1876, 3, 10) },
  { id: "wright-flyer", label: "first powered flight at Kitty Hawk (1903)", start: keyOf(1903, 12, 17), end: keyOf(1903, 12, 17) },
  { id: "ww1", label: "World War I (1914–1918)", start: keyOf(1914, 7, 28), end: keyOf(1918, 11, 11) },
  { id: "nineteenth-amendment", label: "U.S. women’s suffrage (1920)", start: keyOf(1920, 8, 18), end: keyOf(1920, 8, 18) },
  { id: "ww2", label: "World War II (1939–1945)", start: keyOf(1939, 9, 1), end: keyOf(1945, 9, 2) },
  { id: "apollo-11", label: "the Apollo 11 Moon landing (1969)", start: keyOf(1969, 7, 20), end: keyOf(1969, 7, 20) },
];

/** Periods the death falls inside, as display lines ("Died during World War I"). */
export function diedDuring(death: string | null, deathPrecision: number | null): string[] {
  const d = parseWikiDate(death, deathPrecision);
  if (!d || d.precision < 9) return [];
  const [from, to] = dateRange(d);
  return PERIODS.filter((p) => from >= p.start && to <= p.end).map((p) => `Died during ${p.label}`);
}

/** All world events the person lived through from start to finish. */
export function spannedWorldEvents(
  birth: string | null,
  birthPrecision: number | null,
  death: string | null,
  deathPrecision: number | null,
): Period[] {
  const b = parseWikiDate(birth, birthPrecision);
  const d = parseWikiDate(death, deathPrecision);
  if (!b || !d || b.precision < 9 || d.precision < 9) return [];
  const [, birthLatest] = dateRange(b);
  const [deathEarliest] = dateRange(d);
  if (deathEarliest < birthLatest) return [];
  return WORLD_EVENTS.filter((e) => birthLatest <= e.start && deathEarliest >= e.end);
}

/**
 * Milestones and eras the person lived through from start to finish (Lane 2.9).
 * Both birth and death precision windows must sit entirely outside the event
 * (born on or before event.start, died on or after event.end). Caps at 3
 * (first, middle, last) so long lives trace an arc without crowding the card.
 */
export function theirWorld(
  birth: string | null,
  birthPrecision: number | null,
  death: string | null,
  deathPrecision: number | null,
): string[] {
  const spanned = spannedWorldEvents(birth, birthPrecision, death, deathPrecision).map((e) => e.label);
  if (spanned.length <= 3) return spanned;
  const mid = Math.floor(spanned.length / 2);
  return [spanned[0], spanned[mid], spanned[spanned.length - 1]];
}
