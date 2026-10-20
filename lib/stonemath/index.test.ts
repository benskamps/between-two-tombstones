import { describe, expect, it } from "vitest";
import {
  addDays,
  ageAtDeathYears,
  birthFromAged,
  compareYMD,
  daysInMonth,
  exactAge,
  formatAge,
  formatYMD,
  fromDayNumber,
  isLeapYear,
  parseAged,
  parseIsoDate,
  toDayNumber,
  type YMD,
} from "./index";

const ymd = (y: number, m: number, d: number): YMD => ({ y, m, d });

// Small deterministic PRNG so the property checks are repeatable.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("calendar basics", () => {
  it("uses Gregorian leap years, including before 1900", () => {
    expect(isLeapYear(1600)).toBe(true);
    expect(isLeapYear(1700)).toBe(false);
    expect(isLeapYear(1800)).toBe(false);
    expect(isLeapYear(1840)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(1800, 2)).toBe(28);
    expect(daysInMonth(1848, 2)).toBe(29);
    expect(daysInMonth(1851, 4)).toBe(30);
  });

  it("converts day numbers both ways without Date", () => {
    expect(toDayNumber(ymd(1970, 1, 1))).toBe(0);
    expect(toDayNumber(ymd(1970, 1, 2))).toBe(1);
    expect(toDayNumber(ymd(1969, 12, 31))).toBe(-1);
    // Cross-check against Date.UTC for a spread of dates (Date only as an oracle).
    const rand = prng(7);
    for (let i = 0; i < 2000; i += 1) {
      const y = 1600 + Math.floor(rand() * 500);
      const m = 1 + Math.floor(rand() * 12);
      const d = 1 + Math.floor(rand() * daysInMonth(y, m));
      const n = toDayNumber(ymd(y, m, d));
      expect(n).toBe(Date.UTC(y, m - 1, d) / 86400000);
      expect(fromDayNumber(n)).toEqual(ymd(y, m, d));
    }
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays(ymd(1848, 2, 28), 1)).toEqual(ymd(1848, 2, 29));
    expect(addDays(ymd(1800, 2, 28), 1)).toEqual(ymd(1800, 3, 1));
    expect(addDays(ymd(1859, 12, 31), 1)).toEqual(ymd(1860, 1, 1));
    expect(addDays(ymd(1851, 3, 4), -73)).toEqual(ymd(1850, 12, 21));
  });
});

describe("exactAge", () => {
  it("Washington Irving: Apr 3, 1783 – Nov 28, 1859 = 76y 7m 25d", () => {
    expect(exactAge(ymd(1783, 4, 3), ymd(1859, 11, 28))).toEqual({ years: 76, months: 7, days: 25 });
  });

  it("borrows the month before the death month when the days go negative", () => {
    // Dec 21, 1816 → Mar 4, 1851: borrow February 1851 (28 days).
    expect(exactAge(ymd(1816, 12, 21), ymd(1851, 3, 4))).toEqual({ years: 34, months: 2, days: 11 });
    // Same dates in a leap year borrow 29 days.
    expect(exactAge(ymd(1815, 12, 21), ymd(1848, 3, 4))).toEqual({ years: 32, months: 2, days: 12 });
  });

  it("same day is zero", () => {
    expect(exactAge(ymd(1862, 7, 4), ymd(1862, 7, 4))).toEqual({ years: 0, months: 0, days: 0 });
  });

  it("death before the birthday in the death year", () => {
    expect(exactAge(ymd(1800, 10, 15), ymd(1850, 3, 20))).toEqual({ years: 49, months: 5, days: 5 });
    expect(exactAge(ymd(1800, 10, 15), ymd(1850, 10, 14))).toEqual({ years: 49, months: 11, days: 29 });
    expect(exactAge(ymd(1800, 10, 15), ymd(1850, 10, 15))).toEqual({ years: 50, months: 0, days: 0 });
  });

  it("month-end deaths", () => {
    // March has 31 days, so Mar 31 → Apr 30 is 30 days, not a month.
    expect(exactAge(ymd(1850, 3, 31), ymd(1850, 4, 30))).toEqual({ years: 0, months: 0, days: 30 });
    expect(exactAge(ymd(1850, 3, 30), ymd(1850, 4, 30))).toEqual({ years: 0, months: 1, days: 0 });
    expect(exactAge(ymd(1851, 1, 31), ymd(1851, 2, 28))).toEqual({ years: 0, months: 0, days: 28 });
    // Birth day past the end of February: counted from February's last day.
    expect(exactAge(ymd(1851, 1, 30), ymd(1851, 3, 1))).toEqual({ years: 0, months: 1, days: 1 });
    expect(exactAge(ymd(1851, 1, 31), ymd(1851, 3, 1))).toEqual({ years: 0, months: 1, days: 1 });
    expect(exactAge(ymd(1851, 1, 28), ymd(1851, 3, 1))).toEqual({ years: 0, months: 1, days: 1 });
    expect(exactAge(ymd(1851, 2, 1), ymd(1851, 3, 1))).toEqual({ years: 0, months: 1, days: 0 });
  });

  it("Feb 29 births", () => {
    expect(exactAge(ymd(1840, 2, 29), ymd(1841, 2, 28))).toEqual({ years: 0, months: 11, days: 30 });
    // In a common year Feb 29 counts as Feb 28, so Mar 1 is one day past it.
    expect(exactAge(ymd(1840, 2, 29), ymd(1841, 3, 1))).toEqual({ years: 1, months: 0, days: 1 });
    expect(exactAge(ymd(1840, 2, 29), ymd(1844, 2, 29))).toEqual({ years: 4, months: 0, days: 0 });
    // 1900 was not a leap year, 1600 was.
    expect(exactAge(ymd(1896, 2, 29), ymd(1900, 3, 1))).toEqual({ years: 4, months: 0, days: 1 });
    expect(exactAge(ymd(1596, 2, 29), ymd(1600, 3, 1))).toEqual({ years: 4, months: 0, days: 1 });
    expect(exactAge(ymd(1596, 2, 29), ymd(1600, 2, 29))).toEqual({ years: 4, months: 0, days: 0 });
  });

  it("works for 1600s dates", () => {
    expect(exactAge(ymd(1650, 6, 10), ymd(1700, 1, 5))).toEqual({ years: 49, months: 6, days: 26 });
  });

  it("rejects impossible dates and deaths before births", () => {
    expect(() => exactAge(ymd(1851, 2, 29), ymd(1900, 1, 1))).toThrow(RangeError);
    expect(() => exactAge(ymd(1851, 13, 1), ymd(1900, 1, 1))).toThrow(RangeError);
    expect(() => exactAge(ymd(1900, 1, 2), ymd(1900, 1, 1))).toThrow(RangeError);
  });

  it("agrees with counting forward by anniversaries when the birth day is 1–28", () => {
    // Independent oracle: birth + (years*12 + months) months, then + days, must land on death.
    const rand = prng(42);
    for (let i = 0; i < 3000; i += 1) {
      const birth = ymd(1600 + Math.floor(rand() * 420), 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 28));
      const death = addDays(birth, Math.floor(rand() * 40000));
      const age = exactAge(birth, death);
      const totalMonths = (birth.m - 1) + age.years * 12 + age.months;
      const anniversary = ymd(birth.y + Math.floor(totalMonths / 12), (totalMonths % 12) + 1, birth.d);
      expect(addDays(anniversary, age.days)).toEqual(death);
      expect(age.months).toBeLessThan(12);
      expect(age.days).toBeLessThan(31);
    }
  });

  it("never makes a later birth older (fixed death date)", () => {
    const death = ymd(1851, 3, 1);
    let prev = Infinity;
    for (let n = toDayNumber(ymd(1849, 1, 1)); n <= toDayNumber(death); n += 1) {
      const a = exactAge(fromDayNumber(n), death);
      const score = a.years * 10000 + a.months * 100 + a.days;
      expect(score).toBeLessThanOrEqual(prev);
      prev = score;
    }
  });
});

describe("birthFromAged", () => {
  it("Died March 4, 1851, aged 34y 2m 11d → born Dec 21, 1816", () => {
    const result = birthFromAged(ymd(1851, 3, 4), { years: 34, months: 2, days: 11 });
    expect(result.birth).toEqual(ymd(1816, 12, 21));
    expect(result.exact).toBe(true);
    expect(result.matches).toEqual([ymd(1816, 12, 21)]);
  });

  it("Irving round-trips", () => {
    const result = birthFromAged(ymd(1859, 11, 28), { years: 76, months: 7, days: 25 });
    expect(result.birth).toEqual(ymd(1783, 4, 3));
    expect(result.exact).toBe(true);
  });

  it("lists every birth date that fits at a month end", () => {
    // Born Jan 28, 29, 30 or 31 and died Mar 1, 1851 all give "1 month 1 day".
    const result = birthFromAged(ymd(1851, 3, 1), { years: 0, months: 1, days: 1 });
    expect(result.exact).toBe(true);
    expect(result.birth).toEqual(ymd(1851, 1, 28));
    expect(result.matches).toEqual([ymd(1851, 1, 28), ymd(1851, 1, 29), ymd(1851, 1, 30), ymd(1851, 1, 31)]);
  });

  it("searches nearby when the arithmetic lands on a non-matching day", () => {
    // Death Apr 30, aged 0y 0m 30d: arithmetic gives Mar 31, which round-trips.
    expect(birthFromAged(ymd(1850, 4, 30), { years: 0, months: 0, days: 30 }).birth).toEqual(ymd(1850, 3, 31));
    // Death May 31, 1851, aged 1m 0d: arithmetic says Apr 31, which doesn't
    // exist; clamped to Apr 30 (1m 1d), the search finds nothing closer, so the
    // answer is flagged inexact rather than silently "fixed".
    const r = birthFromAged(ymd(1851, 5, 31), { years: 0, months: 1, days: 0 });
    expect(r.birth).toEqual(ymd(1851, 4, 30));
    expect(r.exact).toBe(false);
    // Death Mar 31, 1851, aged 1y 1m 3d: Feb 28, 1850 round-trips.
    const s = birthFromAged(ymd(1851, 3, 31), { years: 1, months: 1, days: 3 });
    expect(s).toEqual({ birth: ymd(1850, 2, 28), exact: true, matches: [ymd(1850, 2, 28)] });
  });

  it("reports when no date in ±6 days fits", () => {
    // Died Mar 20, 1851: the day column borrows February (28 days), so no birth
    // date gives "1 year, 29 days" (Feb 19 → 1y 1m 1d, Feb 21 → 1y 0m 27d).
    const r = birthFromAged(ymd(1851, 3, 20), { years: 1, months: 0, days: 29 });
    expect(r.exact).toBe(false);
    expect(r.matches).toEqual([]);
    expect(r.birth).toEqual(ymd(1850, 2, 19));
  });

  it("counts days back when the days overflow a month", () => {
    const r = birthFromAged(ymd(1851, 3, 1), { years: 2, months: 0, days: 40 });
    expect(r.exact).toBe(false);
    expect(r.birth).toEqual(ymd(1849, 1, 20));
  });

  it("handles a Feb 29 birth", () => {
    const r = birthFromAged(ymd(1844, 2, 29), { years: 4, months: 0, days: 0 });
    expect(r.birth).toEqual(ymd(1840, 2, 29));
    expect(r.exact).toBe(true);
  });

  it("works an age in days back by day count", () => {
    const r = birthFromAged(ymd(1851, 3, 1), { years: 0, months: 0, days: 40 });
    expect(r.birth).toEqual(ymd(1851, 1, 20));
    expect(r.exact).toBe(true);
  });

  it("round-trips every random birth/death pair", () => {
    const rand = prng(1859);
    for (let i = 0; i < 5000; i += 1) {
      const birth = fromDayNumber(toDayNumber(ymd(1600, 1, 1)) + Math.floor(rand() * 150000));
      const death = addDays(birth, Math.floor(rand() * 40000));
      const age = exactAge(birth, death);
      const r = birthFromAged(death, age);
      expect(r.exact).toBe(true);
      expect(r.matches).toContainEqual(birth);
      expect(exactAge(r.birth, death)).toEqual(age);
    }
  });

  it("rejects bad input", () => {
    expect(() => birthFromAged(ymd(1851, 2, 30), { years: 1, months: 0, days: 0 })).toThrow(RangeError);
    expect(() => birthFromAged(ymd(1851, 2, 3), { years: -1, months: 0, days: 0 })).toThrow(RangeError);
    expect(() => birthFromAged(ymd(1851, 2, 3), { years: 1.5, months: 0, days: 0 })).toThrow(RangeError);
  });
});

describe("parseAged", () => {
  it.each([
    ["Aged 34 y'rs 2 m's 11 d's", { years: 34, months: 2, days: 11, precision: "days" }],
    ["aged 34 yrs. 2 mos. 11 days", { years: 34, months: 2, days: 11, precision: "days" }],
    ["AE 34Y 2M 11D", { years: 34, months: 2, days: 11, precision: "days" }],
    ["AE34Y 2M 11D", { years: 34, months: 2, days: 11, precision: "days" }],
    ["Aged 76 Yrs. 7 Mos. & 25 Ds.", { years: 76, months: 7, days: 25, precision: "days" }],
    ["34 years, 2 months and 11 days", { years: 34, months: 2, days: 11, precision: "days" }],
    ["aged 34y.2m.11d.", { years: 34, months: 2, days: 11, precision: "days" }],
    ["Aged 34 y’rs 2 m’s 11 d’s", { years: 34, months: 2, days: 11, precision: "days" }],
    ["Æt. 72", { years: 72, months: 0, days: 0, precision: "years" }],
    ["aged 72 years", { years: 72, months: 0, days: 0, precision: "years" }],
    ["aged 6 mo's", { years: 0, months: 6, days: 0, precision: "months" }],
    ["aged 3 yrs 6 ms", { years: 3, months: 6, days: 0, precision: "months" }],
    ["aged 11 days", { years: 0, months: 0, days: 11, precision: "days" }],
    ["aged 2 weeks", { years: 0, months: 0, days: 14, precision: "days" }],
    ["aged 18 months", { years: 1, months: 6, days: 0, precision: "months" }],
    ["aged seventy-six years", { years: 76, months: 0, days: 0, precision: "years" }],
    ["aged one hundred years", { years: 100, months: 0, days: 0, precision: "years" }],
    ["aged one hundred and two years", { years: 102, months: 0, days: 0, precision: "years" }],
    ["aged twenty one years, four months", { years: 21, months: 4, days: 0, precision: "months" }],
  ])("%s", (text, expected) => {
    expect(parseAged(text)).toEqual(expected);
  });

  it('"in the 76th year of his age" means 75 full years', () => {
    expect(parseAged("in the 76th year of his age")).toEqual({
      years: 75,
      months: 0,
      days: 0,
      precision: "years",
      inYear: 76,
    });
    expect(parseAged("Died in her seventy-sixth year")).toMatchObject({ years: 75, inYear: 76 });
    expect(parseAged("in the 1st year of her age")).toMatchObject({ years: 0, inYear: 1 });
  });

  it("finds the age inside a full inscription without reading dates as ages", () => {
    expect(parseAged("Died March 4, 1851, aged 34y 2m 11d")).toEqual({
      years: 34,
      months: 2,
      days: 11,
      precision: "days",
    });
    expect(parseAged("Born 1816 died 1851")).toBeNull();
    expect(parseAged("Dec. 21, 1816 – Mar. 4, 1851")).toBeNull();
  });

  it("returns null when there is no age", () => {
    expect(parseAged("Asleep in Jesus")).toBeNull();
    expect(parseAged("")).toBeNull();
  });

  it("feeds birthFromAged", () => {
    const age = parseAged("Died March 4, 1851, aged 34y 2m 11d");
    expect(age).not.toBeNull();
    expect(birthFromAged(ymd(1851, 3, 4), age!).birth).toEqual(ymd(1816, 12, 21));
  });
});

describe("formatting and helpers", () => {
  it("formatAge", () => {
    expect(formatAge({ years: 76, months: 7, days: 25 })).toBe("76 years, 7 months, 25 days");
    expect(formatAge({ years: 1, months: 1, days: 1 })).toBe("1 year, 1 month, 1 day");
    expect(formatAge({ years: 34, months: 0, days: 11 })).toBe("34 years, 11 days");
    expect(formatAge({ years: 0, months: 0, days: 0 })).toBe("0 days");
  });

  it("ageAtDeathYears is the whole-years number", () => {
    expect(ageAtDeathYears(ymd(1783, 4, 3), ymd(1859, 11, 28))).toBe(76);
    expect(ageAtDeathYears(ymd(1800, 10, 15), ymd(1850, 10, 14))).toBe(49);
    expect(ageAtDeathYears(ymd(1800, 10, 15), ymd(1850, 10, 15))).toBe(50);
  });

  it("formatYMD and parseIsoDate", () => {
    expect(formatYMD(ymd(1859, 11, 28))).toBe("November 28, 1859");
    expect(parseIsoDate("1783-04-03T00:00:00Z")).toEqual(ymd(1783, 4, 3));
    expect(parseIsoDate("+1859-11-28T00:00:00Z")).toEqual(ymd(1859, 11, 28));
    expect(parseIsoDate("1851-02-29")).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate("not a date")).toBeNull();
  });

  it("compareYMD", () => {
    expect(compareYMD(ymd(1850, 1, 1), ymd(1850, 1, 2))).toBe(-1);
    expect(compareYMD(ymd(1850, 1, 1), ymd(1850, 1, 1))).toBe(0);
    expect(compareYMD(ymd(1851, 1, 1), ymd(1850, 12, 31))).toBe(1);
  });
});
