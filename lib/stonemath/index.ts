// Stone math: ages and dates the way they were carved.
//
// Everything works on plain { y, m, d } objects in the proleptic Gregorian
// calendar (m is 1–12). No JS Date, so no time zones and no 1900 cutoff.
//
// Note for very old stones: British colonies switched from the Julian calendar
// in 1752, and earlier stones may carry Old Style or dual dates ("Feb 3 1719/20").
// This module does not convert calendars; it does the arithmetic on the dates
// as given.

export type YMD = { y: number; m: number; d: number };
export type Age = { years: number; months: number; days: number };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

export function isValidYMD(date: YMD): boolean {
  const { y, m, d } = date;
  return (
    Number.isInteger(y) &&
    Number.isInteger(m) &&
    Number.isInteger(d) &&
    y >= 1 &&
    y <= 9999 &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= daysInMonth(y, m)
  );
}

function assertValid(date: YMD, label: string): void {
  if (!isValidYMD(date)) {
    throw new RangeError(`${label} is not a real calendar date: ${JSON.stringify(date)}`);
  }
}

/** -1, 0 or 1. */
export function compareYMD(a: YMD, b: YMD): number {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : 1;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return 0;
}

/** Days since 1970-01-01 (proleptic Gregorian), by integer arithmetic only. */
export function toDayNumber({ y, m, d }: YMD): number {
  // Howard Hinnant's days_from_civil.
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): YMD {
  // Howard Hinnant's civil_from_days.
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export function addDays(date: YMD, days: number): YMD {
  return fromDayNumber(toDayNumber(date) + days);
}

function monthBefore({ y, m }: YMD): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

/**
 * Exact age at death in full years, then full months, then remaining days:
 * the column subtraction a stonecutter would do (death minus birth, day column
 * first), borrowing a month when the days go negative.
 *
 * Borrowing adds the length of the month before the death month. When the
 * birth day is past the end of that shorter month (born Jan 30, died Mar 1),
 * the birth day counts as that month's last day, so the result is
 * "1 month, 1 day" rather than a negative day count.
 *
 * Consequences worth knowing:
 * - Born Mar 31, died Apr 30 → 0 months, 30 days (March's 31 days are borrowed).
 * - Born Feb 29, 1840: in a common year Feb 29 counts as Feb 28, so on Feb 28,
 *   1841 the age is 11 months, 30 days (January's 31 days are borrowed) and on
 *   Mar 1, 1841 it is 1 year, 1 day. On Feb 29, 1844 it is 4 years exactly.
 *
 * Throws RangeError for invalid dates or a death before the birth.
 */
export function exactAge(birth: YMD, death: YMD): Age {
  assertValid(birth, "Birth date");
  assertValid(death, "Death date");
  if (compareYMD(death, birth) < 0) {
    throw new RangeError("The death date is before the birth date.");
  }

  let years = death.y - birth.y;
  let months = death.m - birth.m;
  let days = death.d - birth.d;

  if (days < 0) {
    months -= 1;
    const prev = monthBefore(death);
    days = death.d + Math.max(0, daysInMonth(prev.y, prev.m) - birth.d);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

/** Whole years at death: the number Lane 3b prints as the postage-stamp value. */
export function ageAtDeathYears(birth: YMD, death: YMD): number {
  return exactAge(birth, death).years;
}

export type BirthEstimate = {
  /** The birth date worked back from the death date and the carved age. */
  birth: YMD;
  /**
   * True when exactAge(birth, death) gives back the carved age exactly. For an
   * age carved purely in days ("aged 40 days") it means the day count matches.
   */
  exact: boolean;
  /**
   * Every date within ±6 days of the arithmetic answer whose exact age matches
   * the carved age, in date order. More than one entry means the carved age
   * fits several birth dates (this happens around month ends), so show a range.
   */
  matches: YMD[];
};

const SEARCH_DAYS = 6;

function sameAge(a: Age, b: Age): boolean {
  return a.years === b.years && a.months === b.months && a.days === b.days;
}

function ageOrNull(birth: YMD, death: YMD): Age | null {
  if (!isValidYMD(birth) || compareYMD(death, birth) < 0) return null;
  return exactAge(birth, death);
}

function subtractYearsMonths(death: YMD, years: number, months: number): { y: number; m: number } {
  let y = death.y - years;
  let m = death.m - months;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { y, m };
}

/**
 * Works the birth date back from the death date and the carved age
 * ("Died March 4, 1851, aged 34y 2m 11d" → Dec 21, 1816), then checks it by
 * running exactAge forward. If the arithmetic answer doesn't round-trip
 * (month-end ambiguity), it searches ±6 days for the nearest date that does.
 *
 * Ages with more days than a month holds ("aged 40 days") are worked back as a
 * plain day count after the years and months.
 */
export function birthFromAged(death: YMD, age: Age): BirthEstimate {
  assertValid(death, "Death date");
  for (const k of ["years", "months", "days"] as const) {
    if (!Number.isInteger(age[k]) || age[k] < 0) throw new RangeError(`Age ${k} must be a whole number ≥ 0.`);
  }

  if (age.years === 0 && age.months === 0) {
    // "Aged 40 days" is a day count; it agrees with exactAge whenever the count
    // is short of a month.
    const birth = addDays(death, -age.days);
    if (birth.y < 1) throw new RangeError("That age reaches back before year 1.");
    return { birth, exact: true, matches: [birth] };
  }

  // Inverse of the column subtraction in exactAge: borrow the month before the
  // death month when the day column goes below 1.
  const borrow = death.d - age.days < 1;
  const prev = monthBefore(death);
  const d = death.d - age.days + (borrow ? daysInMonth(prev.y, prev.m) : 0);
  const { y, m } = subtractYearsMonths(death, age.years, age.months + (borrow ? 1 : 0));
  if (y < 1) throw new RangeError("That age reaches back before year 1.");

  if (d < 1) {
    // More days than one borrowed month holds ("aged 2 years 40 days"): no
    // y/m/d age says that, so count the days back and call it inexact.
    const ym = subtractYearsMonths(death, age.years, age.months);
    const start = { ...ym, d: Math.min(death.d, daysInMonth(ym.y, ym.m)) };
    return { birth: addDays(start, -age.days), exact: false, matches: [] };
  }

  const candidate: YMD = { y, m, d: Math.min(d, daysInMonth(y, m)) };
  const matches: YMD[] = [];
  for (let offset = -SEARCH_DAYS; offset <= SEARCH_DAYS; offset += 1) {
    const date = addDays(candidate, offset);
    const got = ageOrNull(date, death);
    if (got && sameAge(got, age)) matches.push(date);
  }

  const candidateAge = ageOrNull(candidate, death);
  if (candidateAge && sameAge(candidateAge, age)) return { birth: candidate, exact: true, matches };
  if (matches.length > 0) {
    const base = toDayNumber(candidate);
    const distance = (date: YMD) => Math.abs(toDayNumber(date) - base);
    const nearest = matches.reduce((best, date) => (distance(date) < distance(best) ? date : best));
    return { birth: nearest, exact: true, matches };
  }
  return { birth: candidate, exact: false, matches };
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * "76 years, 7 months, 25 days". Zero parts are left out ("34 years, 11 days");
 * an age of zero reads "0 days".
 */
export function formatAge(age: Age): string {
  const parts: string[] = [];
  if (age.years) parts.push(plural(age.years, "year"));
  if (age.months) parts.push(plural(age.months, "month"));
  if (age.days) parts.push(plural(age.days, "day"));
  return parts.length ? parts.join(", ") : "0 days";
}

/** "November 28, 1859". */
export function formatYMD(date: YMD): string {
  return `${MONTH_NAMES[date.m - 1]} ${date.d}, ${date.y}`;
}

/**
 * Reads the date part of an ISO or Wikidata timestamp ("1783-04-03",
 * "+1859-11-28T00:00:00Z") without Date. Returns null if it isn't a real date.
 * Wikidata stores year-only dates as Jan 1, so check the precision field
 * (11 = day) before trusting the month and day.
 */
export function parseIsoDate(iso: string | null | undefined): YMD | null {
  const match = iso?.match(/^\+?(\d{1,4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
  return isValidYMD(date) ? date : null;
}

// ---------------------------------------------------------------------------
// Reading carved ages

export type ParsedAged = Age & {
  /**
   * The finest unit actually carved. "years" means months and days were not
   * carved and are set to 0; treat the age as "at least that many years".
   */
  precision: "years" | "months" | "days";
  /**
   * Set for "in the Nth year of his/her age". Being in your 76th year means 75
   * full years have passed, so `years` is N − 1 and `inYear` is N. The true age
   * is anywhere from 75 years 0 days to 75 years 11 months 30 days, so
   * birthFromAged on this value gives the latest possible birth date.
   */
  inYear?: number;
};

const CARDINALS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15,
  sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
  twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50, sixtieth: 60, seventieth: 70,
  eightieth: 80, ninetieth: 90,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90,
};

const alternatives = (words: string[]) => words.sort((a, b) => b.length - a.length).join("|");
const DIGIT_WORDS = Object.keys(CARDINALS).filter((w) => CARDINALS[w] >= 1 && CARDINALS[w] <= 9);
const DIGIT_ORDINALS = Object.keys(ORDINALS).filter((w) => ORDINALS[w] <= 9);
// "seventy-six", "seventy-sixth", "nineteen", "fourth": tens, then digit, or one word.
const UNDER_HUNDRED =
  `(?:(${alternatives(Object.keys(TENS))})(?:[\\s-]+(${alternatives([...DIGIT_WORDS, ...DIGIT_ORDINALS])}))?` +
  `|(${alternatives([...Object.keys(CARDINALS), ...Object.keys(ORDINALS)])}))`;
// Tried in this order: "one hundred and two", then "one hundred(th)", then 0–99.
const SPELLED_NUMBER = new RegExp(
  `\\b(?:one|a)\\s+hundred(?:\\s+and)?[\\s-]+${UNDER_HUNDRED}\\b` +
    `|\\b(?:one|a)\\s+hundred(th)?\\b` +
    `|\\b${UNDER_HUNDRED}\\b`,
  "g",
);

function spelledValue(tens?: string, unit?: string, single?: string): { value: number; ordinal: boolean } {
  if (tens) {
    if (!unit) return { value: TENS[tens], ordinal: false };
    const ordinal = unit in ORDINALS;
    return { value: TENS[tens] + (ordinal ? ORDINALS[unit] : CARDINALS[unit]), ordinal };
  }
  const ordinal = !!single && single in ORDINALS;
  return { value: single ? (ordinal ? ORDINALS[single] : CARDINALS[single]) : 0, ordinal };
}

/**
 * Turns spelled numbers into digits: "seventy-six" → "76", "seventy-sixth" →
 * "76th", "one hundred and two" → "102". Covers 0–199, which is every age.
 */
function spelledNumbersToDigits(text: string): string {
  return text.replace(SPELLED_NUMBER, (...groups: (string | undefined)[]) => {
    const [, t1, u1, s1, hundredth, t2, u2, s2] = groups;
    if (t1 || s1) {
      const { value, ordinal } = spelledValue(t1, u1, s1);
      return `${100 + value}${ordinal ? "th" : ""}`;
    }
    if (t2 || s2) {
      const { value, ordinal } = spelledValue(t2, u2, s2);
      return `${value}${ordinal ? "th" : ""}`;
    }
    return hundredth ? "100th" : "100";
  });
}

const UNIT =
  "(years?|yrs?|yr'?s|y'?rs?|y'?s|y|months?|mos?|mo'?s|mons?|mths?|m'?s|m|weeks?|wks?|w'?s|w|days?|dys?|d'?s|d)";
// A 1–3 digit number that isn't part of a longer number (so "1816 died" is
// never "816 days"), then a unit that isn't the start of a longer word.
const COMPONENT = `(?<!\\d)(\\d{1,3})(?!\\d)\\s*${UNIT}(?![a-z])\\.?`;

type Unit = "years" | "months" | "weeks" | "days";

function unitKind(token: string): Unit {
  if (token.startsWith("y")) return "years";
  if (token.startsWith("m")) return "months";
  if (token.startsWith("w")) return "weeks";
  return "days";
}

function normalizeCarving(text: string): string {
  return spelledNumbersToDigits(
    text
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/[‘’ʼ`´]/g, "'")
      .replace(/\s+/g, " "),
  );
}

/**
 * Reads a carved age. Handles the usual forms:
 *   "Aged 34 y'rs 2 m's 11 d's", "aged 34 yrs. 2 mos. 11 days",
 *   "AE 34Y 2M 11D", "Æt. 72", "aged 6 mo's", "aged 2 weeks",
 *   "34 years, 2 months & 11 days", "aged seventy-six years",
 *   "in the 76th year of his age", "in her seventy-sixth year".
 * Weeks become days (7 each); 12 or more months roll into years.
 * Returns null when no age is found.
 */
export function parseAged(text: string): ParsedAged | null {
  const s = normalizeCarving(text);

  const inYear = s.match(/\bin\s+(?:the|his|her|their)\s+(\d{1,3})\s*(?:st|nd|rd|th)?\s+year\b/);
  if (inYear) {
    const n = Number(inYear[1]);
    if (n >= 1 && n <= 150) return { years: n - 1, months: 0, days: 0, precision: "years", inYear: n };
  }

  // Read after an "aged" / "Æ" / "Æt." marker when there is one, so the dates
  // around it can't be mistaken for an age.
  const anchor = s.match(/\b(?:aged|age|aetatis|aetat|aet|ae)(?=[\s.:,\d]|$)\.?:?/);
  const body = anchor ? s.slice((anchor.index ?? 0) + anchor[0].length) : s;

  const first = body.match(new RegExp(COMPONENT));
  if (!first) {
    const bare = anchor ? body.match(/^\s*(\d{1,3})(?!\d)/) : null;
    return bare ? { years: Number(bare[1]), months: 0, days: 0, precision: "years" } : null;
  }

  // Take consecutive components from the first one, each unit at most once.
  const component = new RegExp(COMPONENT, "y");
  const separator = /(?:[\s,;:&-]|\band\b)*/y;
  const found: Partial<Record<Unit, number>> = {};
  let i = first.index ?? 0;
  for (let guard = 0; guard < 4; guard += 1) {
    component.lastIndex = i;
    const match = component.exec(body);
    if (!match) break;
    const kind = unitKind(match[2]);
    if (kind in found) break;
    found[kind] = Number(match[1]);
    separator.lastIndex = component.lastIndex;
    separator.exec(body);
    i = separator.lastIndex;
  }

  let years = found.years ?? 0;
  let months = found.months ?? 0;
  const days = (found.days ?? 0) + 7 * (found.weeks ?? 0);
  if (months >= 12) {
    years += Math.floor(months / 12);
    months %= 12;
  }
  const precision: ParsedAged["precision"] =
    found.days !== undefined || found.weeks !== undefined
      ? "days"
      : found.months !== undefined
        ? "months"
        : "years";
  return { years, months, days, precision };
}
