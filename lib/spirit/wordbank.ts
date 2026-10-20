// The spirit box's vocabulary. Built only from people who died at least 75 years
// ago (lib/respect.ts decides who that is), plus a short, fixed list of
// connective words. Pure: no DOM, no randomness except the rng you pass in.

import type { Person } from "../types";
import { deathYear, spiritEligible } from "../respect";

/** The only words in the bank that don't come from a burial. Fixed on purpose. */
export const CONNECTIVES = ["cold", "here", "stay", "who", "yes", "no", "listen"] as const;

export type SpiritPerson = Pick<Person, "qid" | "name" | "death" | "deathPrecision" | "occupations">;

export type WordBank = {
  /** "Washington Irving": first name and surname of the same person. */
  fullNames: string[];
  firstNames: string[];
  surnames: string[];
  /** Occupations of at most three words, lower case. */
  occupations: string[];
  /** Death years as spoken words: "eighteen fifty-nine". */
  years: string[];
  connectives: readonly string[];
  /** People who contributed words (died 75+ years ago). */
  eligibleCount: number;
  /** People left out: died less than 75 years ago, or the death date is unknown. */
  excludedCount: number;
};

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0–99 as words: 7 → "seven", 56 → "fifty-six". */
function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? t : `${t}-${ONES[n % 10]}`;
}

/** 0–999 as words: 476 → "four hundred seventy-six". */
function underThousand(n: number): string {
  if (n < 100) return underHundred(n);
  const h = `${ONES[Math.floor(n / 100)]} hundred`;
  return n % 100 === 0 ? h : `${h} ${underHundred(n % 100)}`;
}

/**
 * A year the way people say it: 1890 → "eighteen ninety", 1904 → "nineteen oh
 * four", 1800 → "eighteen hundred", 2005 → "two thousand five". Null for years
 * before 1 AD (the spirit box skips those).
 */
export function yearToWords(year: number): string | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  if (year < 1000) return underThousand(year);
  if (year >= 2000 && year < 2010) return year === 2000 ? "two thousand" : `two thousand ${ONES[year % 10]}`;
  const hi = Math.floor(year / 100);
  const lo = year % 100;
  const head = underHundred(hi);
  if (lo === 0) return `${head} hundred`;
  if (lo < 10) return `${head} oh ${ONES[lo]}`;
  return `${head} ${underHundred(lo)}`;
}

const SUFFIXES = new Set(["jr", "sr", "i", "ii", "iii", "iv", "v", "esq"]);
const TITLES = new Set(["mr", "mrs", "ms", "miss", "madame", "mme", "dr", "sir", "dame", "lady", "lord", "rev", "reverend"]);
const PARTICLES = new Set(["van", "von", "de", "der", "den", "del", "della", "di", "da", "du", "la", "le", "st"]);

function bare(token: string): string {
  return token.toLowerCase().replace(/\./g, "");
}

function isInitial(token: string): boolean {
  return /^\p{L}\.?$/u.test(token);
}

/**
 * Split a Wikidata label into a first name and a surname. Skips unlabeled items
 * ("Q6986296"), initials ("S. B. Spencer" has no usable first name), titles
 * ("Madame Restell") and suffixes ("Alfred Iverson, Jr.").
 */
export function splitName(name: string): { first: string | null; last: string | null } {
  const label = name.replace(/\([^)]*\)/g, " ").trim();
  if (!label || /^Q\d+$/.test(label)) return { first: null, last: null };
  const tokens = label
    .split(/[\s,]+/)
    .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}.']+$/gu, ""))
    .filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(bare(tokens[tokens.length - 1]))) tokens.pop();
  let hadTitle = false;
  while (tokens.length > 1 && TITLES.has(bare(tokens[0]))) {
    tokens.shift();
    hadTitle = true;
  }
  if (tokens.length === 0) return { first: null, last: null };

  let lastIdx = tokens.length - 1;
  let last: string | null = isInitial(tokens[lastIdx]) ? null : tokens[lastIdx];
  // "Martin Van Buren" → "Van Buren".
  if (last && lastIdx > 1 && PARTICLES.has(bare(tokens[lastIdx - 1]))) {
    lastIdx -= 1;
    last = `${tokens[lastIdx]} ${last}`;
  }
  const firstToken = tokens[0];
  const first = !hadTitle && lastIdx > 0 && !isInitial(firstToken) ? firstToken : null;
  if (tokens.length === 1) return { first: null, last };
  return { first, last };
}

/** Every word one person would add to the bank, whether or not they're eligible. */
export function contributions(p: SpiritPerson): {
  fullName: string | null;
  first: string | null;
  last: string | null;
  occupations: string[];
  year: string | null;
} {
  const { first, last } = splitName(p.name);
  const y = deathYear(p);
  // Precision 9 = year; anything coarser (decade, century) isn't a real year.
  const year = y !== null && (p.deathPrecision ?? 0) >= 9 ? yearToWords(y) : null;
  const occupations = p.occupations
    .map((o) => o.trim().toLowerCase())
    .filter((o) => o.length > 0 && o.split(/\s+/).length <= 3);
  return { fullName: first && last ? `${first} ${last}` : null, first, last, occupations, year };
}

function uniq(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

/** The bank for one cemetery. Only `spiritEligible` people contribute anything. */
export function buildWordBank(people: SpiritPerson[], now = new Date()): WordBank {
  const eligible = people.filter((p) => spiritEligible(p, now));
  const parts = eligible.map(contributions);
  return {
    fullNames: uniq(parts.flatMap((c) => (c.fullName ? [c.fullName] : []))),
    firstNames: uniq(parts.flatMap((c) => (c.first ? [c.first] : []))),
    surnames: uniq(parts.flatMap((c) => (c.last ? [c.last] : []))),
    occupations: uniq(parts.flatMap((c) => c.occupations)),
    years: uniq(parts.flatMap((c) => (c.year ? [c.year] : []))),
    connectives: CONNECTIVES,
    eligibleCount: eligible.length,
    excludedCount: people.length - eligible.length,
  };
}

/** Every distinct phrase the bank could speak, for tests and checks. */
export function bankPhrases(bank: WordBank): string[] {
  return uniq([
    ...bank.fullNames,
    ...bank.firstNames,
    ...bank.surnames,
    ...bank.occupations,
    ...bank.years,
    ...bank.connectives,
  ]);
}

/** True when there's at least one name to speak. */
export function bankHasNames(bank: WordBank): boolean {
  return bank.surnames.length > 0 || bank.firstNames.length > 0;
}

function pick<T>(items: readonly T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function words(phrase: string): number {
  return phrase.split(/\s+/).length;
}

/**
 * One "voice": a 1–3 word fragment. Names come up most, since hearing a real
 * name from this ground is the point; years, occupations and the fixed
 * connectives fill in around them.
 */
export function pickFragment(bank: WordBank, rng: () => number): string {
  const name = () => pick(bank.surnames, rng) ?? pick(bank.firstNames, rng);
  const roll = rng();
  let out: string | null = null;
  if (roll < 0.22) out = pick(bank.fullNames, rng);
  else if (roll < 0.42) out = pick(bank.surnames, rng);
  else if (roll < 0.54) out = pick(bank.firstNames, rng);
  else if (roll < 0.66) out = pick(bank.years, rng);
  else if (roll < 0.76) out = pick(bank.occupations, rng);
  else if (roll < 0.9) {
    // connective + name: "who… Irving", "stay Margaret"
    const c = pick(bank.connectives, rng);
    const n = name();
    out = c && n && words(c) + words(n) <= 3 ? `${c} ${n}` : n;
  } else out = pick(bank.connectives, rng);
  out = out ?? name() ?? pick(bank.connectives, rng) ?? "listen";
  // Never more than three words, even for a long occupation plus a connective.
  return out.split(/\s+/).slice(0, 3).join(" ");
}
