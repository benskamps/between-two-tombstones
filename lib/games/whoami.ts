// "Who Am I?" (Lane 4.5): three clues drawn from a cemetery's burials,
// respecting the 25-year rule (lib/respect.ts). Pure helpers + unit-tested
// redaction so the person's name never leaks into the clues.

import { needsRespectfulStyle } from "@/lib/respect";
import { ageAtDeath, formatAge, formatWikiDate, parseWikiDate } from "@/lib/tour/dates";
import { diedDuring, theirWorld } from "@/lib/tour/periods";
import { cleanExtract } from "@/lib/tour/text";
import type { Person } from "@/lib/types";

export type RiddlePerson = Pick<
  Person,
  | "qid"
  | "name"
  | "description"
  | "birth"
  | "birthPrecision"
  | "death"
  | "deathPrecision"
  | "occupations"
  | "wikipedia"
>;

export type RiddleRound = {
  answer: RiddlePerson;
  clues: [string, string, string];
  options: RiddlePerson[];
};

const BARE_QID = /^Q\d+$/i;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replaces the person's full name and individual name tokens (≥ 3 chars) with "[…]". */
export function redactName(text: string, fullName: string): string {
  const cleaned = text.trim();
  if (!cleaned) return "";
  const tokens = fullName
    .split(/[\s,.'"-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  const patterns = [fullName.trim(), ...tokens]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  if (patterns.length === 0) return cleaned;
  const re = new RegExp(`\\b(${patterns.join("|")})\\b`, "gi");
  return cleaned.replace(re, "[…]").replace(/(\[\…\]\s*){2,}/g, "[…] ");
}

function firstSentence(extract: string): string {
  const cleaned = cleanExtract(extract).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const match = cleaned.match(/^(.{30,240}?[.!?])(?:\s|$)/);
  const raw = match ? match[1] : cleaned.slice(0, 220);
  return raw.trim();
}

export function buildClues(p: RiddlePerson): [string, string, string] | null {
  const b = parseWikiDate(p.birth, p.birthPrecision);
  const d = parseWikiDate(p.death, p.deathPrecision);
  const birthStr = formatWikiDate(b);
  const deathStr = formatWikiDate(d);
  const ageStr = formatAge(ageAtDeath(b, d));
  if (!deathStr) return null;

  const spanParts = [birthStr ? `Born ${birthStr}` : null, `Died ${deathStr}`, ageStr].filter(Boolean);
  const during = diedDuring(p.death, p.deathPrecision);
  const world = theirWorld(p.birth, p.birthPrecision, p.death, p.deathPrecision);
  const eraNote = during[0] ?? (world.length > 0 ? `Lived through ${world[0]}` : null);
  const clue1 = eraNote ? `${spanParts.join(" · ")}. ${eraNote}.` : `${spanParts.join(" · ")}.`;

  const occ = p.occupations.slice(0, 4).join(", ");
  const desc = p.description ? redactName(p.description, p.name) : "";
  const clue2 =
    occ && desc
      ? `Worked as: ${occ} (${desc}).`
      : occ
        ? `Worked as: ${occ}.`
        : desc
          ? `Known as: ${desc}.`
          : null;
  if (!clue2) return null;

  const sentence = p.wikipedia?.extract ? redactName(firstSentence(p.wikipedia.extract), p.name) : "";
  const clue3 =
    sentence.length >= 20
      ? sentence
      : desc
        ? `From the record: ${desc}.`
        : `Remembered as ${occ}.`;

  return [clue1, clue2, clue3];
}

const DEFAULT_NOW = new Date("2026-10-21T00:00:00Z");

/** Filters to burials eligible for "Who Am I?": 25+ years gone, named, with 3 clues. */
export function riddleEligiblePeople(people: readonly RiddlePerson[], now: Date = DEFAULT_NOW): RiddlePerson[] {
  return people.filter((p) => {
    if (!p.name || BARE_QID.test(p.name.trim())) return false;
    if (needsRespectfulStyle(p, now)) return false;
    return buildClues(p) !== null;
  });
}

/** Deterministic round builder given a pool of eligible burials and an index. */
export function makeRiddleRound(eligible: readonly RiddlePerson[], roundIndex: number): RiddleRound | null {
  if (eligible.length < 4) return null;
  const idx = ((roundIndex % eligible.length) + eligible.length) % eligible.length;
  const answer = eligible[idx];
  const clues = buildClues(answer);
  if (!clues) return null;

  const distractors: RiddlePerson[] = [];
  const step = Math.max(1, Math.floor(eligible.length / 4));
  for (let k = 1; distractors.length < 3 && k < eligible.length; k++) {
    const cand = eligible[(idx + k * step) % eligible.length];
    if (cand.qid !== answer.qid && !distractors.some((d) => d.qid === cand.qid)) {
      distractors.push(cand);
    }
  }
  for (let k = 0; distractors.length < 3 && k < eligible.length; k++) {
    const cand = eligible[k];
    if (cand.qid !== answer.qid && !distractors.some((d) => d.qid === cand.qid)) {
      distractors.push(cand);
    }
  }

  const rawOptions = [answer, ...distractors.slice(0, 3)];
  const shift = roundIndex % rawOptions.length;
  const options = [...rawOptions.slice(shift), ...rawOptions.slice(0, shift)];

  return { answer, clues, options };
}
