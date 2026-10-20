// Wikidata dates carry a precision (11 = day, 10 = month, 9 = year, 8 = decade,
// 7 = century) and a signed year ("+1859-11-28T00:00:00Z", "-0044-03-15...").
// Never show more precision than the data has.

export type WikiDate = { year: number; month: number; day: number; precision: number };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function parseWikiDate(iso: string | null, precision: number | null): WikiDate | null {
  if (!iso) return null;
  const m = iso.match(/^([+-]?\d{1,6})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  if (!Number.isFinite(year)) return null;
  return { year, month: Number(m[2]), day: Number(m[3]), precision: precision ?? 9 };
}

function yearText(y: number): string {
  return y <= 0 ? `${1 - y} BC` : String(y);
}

export function formatWikiDate(d: WikiDate | null): string | null {
  if (!d) return null;
  if (d.precision >= 11 && d.month >= 1 && d.day >= 1) return `${MONTHS[d.month - 1]} ${d.day}, ${yearText(d.year)}`;
  if (d.precision === 10 && d.month >= 1) return `${MONTHS[d.month - 1]} ${yearText(d.year)}`;
  if (d.precision === 9) return yearText(d.year);
  if (d.precision === 8) return `the ${Math.floor(d.year / 10) * 10}s`;
  if (d.precision === 7) {
    const c = Math.floor((d.year - 1) / 100) + 1;
    const suffix = c % 10 === 1 && c !== 11 ? "st" : c % 10 === 2 && c !== 12 ? "nd" : c % 10 === 3 && c !== 13 ? "rd" : "th";
    return `the ${c}${suffix} century`;
  }
  return yearText(d.year);
}

/** Age at death: exact when both dates are day-precise, otherwise "about". Null if unknown. */
export function ageAtDeath(birth: WikiDate | null, death: WikiDate | null): { years: number; exact: boolean } | null {
  if (!birth || !death || birth.precision < 9 || death.precision < 9) return null;
  if (birth.precision >= 11 && death.precision >= 11) {
    let years = death.year - birth.year;
    if (death.month < birth.month || (death.month === birth.month && death.day < birth.day)) years -= 1;
    return years >= 0 && years < 130 ? { years, exact: true } : null;
  }
  const years = death.year - birth.year;
  return years >= 0 && years < 130 ? { years, exact: false } : null;
}

export function formatAge(age: { years: number; exact: boolean } | null): string | null {
  if (!age) return null;
  return age.exact ? `aged ${age.years}` : `aged about ${age.years}`;
}

/** Midpoint-free sortable key in days for "walk through time"; null if unknown. */
export function dateKey(d: WikiDate | null): number | null {
  if (!d) return null;
  return d.year * 372 + (d.precision >= 10 ? (d.month - 1) * 31 : 0) + (d.precision >= 11 ? d.day - 1 : 0);
}

/** The interval a date could fall in, as [startKey, endKey] in the same units as dateKey. */
export function dateRange(d: WikiDate): [number, number] {
  if (d.precision >= 11) {
    const k = dateKey(d)!;
    return [k, k];
  }
  if (d.precision === 10) {
    const s = d.year * 372 + (d.month - 1) * 31;
    return [s, s + 30];
  }
  if (d.precision === 9) return [d.year * 372, d.year * 372 + 371];
  if (d.precision === 8) {
    const y = Math.floor(d.year / 10) * 10;
    return [y * 372, (y + 9) * 372 + 371];
  }
  const c = (Math.floor((d.year - 1) / 100)) * 100 + 1;
  return [c * 372, (c + 99) * 372 + 371];
}

export function keyOf(year: number, month: number, day: number): number {
  return year * 372 + (month - 1) * 31 + (day - 1);
}
