// Server-side checks on Claude's reading, applied before anything reaches the
// phone. The prompt already says "copy dates as carved, [?] for the rest";
// this is the second line: anything Claude marked unsure, or any date or age
// that isn't word for word in its own transcription, is taken out and the
// reader is told why.

import { LEGIBILITY, type Legibility, type ModelReading, type StoneReading } from "./types";

const LIMITS = {
  people: 12,
  symbols: 16,
  name: 160,
  date: 80,
  epitaph: 1200,
  symbolName: 80,
  meaning: 240,
  material: 60,
  notes: 600,
  transcription: 4000,
};

const FIELD_WORDS = { birth: "birth date", death: "death date", aged: "age" } as const;
type DateField = keyof typeof FIELD_WORDS;

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?/i;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Letters, digits and [?] only, lower-cased, so "Dec. 21, 1816" matches
 * "DEC 21 1816" but never "Dec. 21, 1818".
 */
export function matchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/\[\?\]/g, "?")
    .replace(/[^\p{L}\p{N}?]/gu, "");
}

/** Why a carved date can't be right, or null if it is plausible. */
export function implausibleDate(text: string, currentYear: number): string | null {
  if (!/[0-9]/.test(text) && !MONTH.test(text)) return "nothing in it can be read as a date";
  for (const match of text.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
    const year = Number(match[1]);
    if (year < 1000 || year > currentYear) return `the year ${year} can't be right`;
  }
  if (/\d{5,}/.test(text)) return "it has more digits than a date";
  return null;
}

const LEGIBILITY_WORDS: Record<string, Legibility> = {
  good: "clear",
  legible: "clear",
  readable: "clear",
  fair: "partial",
  partly: "partial",
  partially: "partial",
  some: "partial",
  bad: "poor",
  illegible: "poor",
  unreadable: "poor",
};

/** "Clear", "partially legible", "illegible" → one of clear / partial / poor, or null. */
export function normalizeLegibility(text: string): Legibility | null {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of words) {
    if ((LEGIBILITY as readonly string[]).includes(word)) return word as Legibility;
  }
  for (const word of words) if (word in LEGIBILITY_WORDS) return LEGIBILITY_WORDS[word];
  return null;
}

export function checkReading(model: ModelReading, opts: { currentYear: number }): StoneReading {
  const transcription = clip(model.transcription, LIMITS.transcription);
  const carved = matchKey(transcription);
  const checks: string[] = [];

  let legibility = normalizeLegibility(model.legibility);
  if (!legibility) {
    legibility = "partial";
    checks.push("Claude didn't say how readable the stone is; treat this reading as partial.");
  }

  const people = model.people.slice(0, LIMITS.people).map((p) => {
    const name = clip(p.name, LIMITS.name) || "[?]";
    const unsure = new Set(p.unsure.map((u) => u.trim().toLowerCase()));
    if (unsure.has("name")) {
      checks.push(`Claude wasn't sure of the name "${name}". Check it against the stone.`);
    } else if (matchKey(name) && !carved.includes(matchKey(name))) {
      checks.push(`The name "${name}" isn't in the transcription. Check it against the stone.`);
    }

    const person: StoneReading["people"][number] = { name };
    for (const field of ["birth", "death", "aged"] as DateField[]) {
      const raw = p[field];
      if (raw === null || !raw.trim()) continue;
      const value = clip(raw, LIMITS.date);
      const what = `${name}'s ${FIELD_WORDS[field]}`;
      if (unsure.has(field)) {
        checks.push(`Left out ${what}: Claude wasn't sure of the reading.`);
        continue;
      }
      if (!carved.includes(matchKey(value))) {
        checks.push(`Left out ${what} ("${value}"): it isn't in the transcription of the stone.`);
        continue;
      }
      if (field !== "aged") {
        const reason = implausibleDate(value, opts.currentYear);
        if (reason) {
          checks.push(`Left out ${what} ("${value}"): ${reason}.`);
          continue;
        }
      }
      person[field] = value;
    }
    return person;
  });

  const reading: StoneReading = {
    people,
    symbols: model.symbols
      .slice(0, LIMITS.symbols)
      .map((s) => ({ name: clip(s.name, LIMITS.symbolName), meaning: clip(s.meaning, LIMITS.meaning) }))
      .filter((s) => s.name),
    legibility,
    transcription,
    checks,
  };
  if (model.epitaph?.trim()) reading.epitaph = clip(model.epitaph, LIMITS.epitaph);
  if (model.material?.trim()) reading.material = clip(model.material, LIMITS.material);
  if (model.notes?.trim()) reading.notes = clip(model.notes, LIMITS.notes);
  return reading;
}
