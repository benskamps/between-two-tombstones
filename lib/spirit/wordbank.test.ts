import { describe, expect, it } from "vitest";
import oakland from "../../data/snapshots/oakland-atlanta.json";
import sleepyHollow from "../../data/snapshots/sleepy-hollow.json";
import { spiritEligible } from "../respect";
import type { CemeterySnapshot } from "../types";
import {
  CONNECTIVES,
  bankPhrases,
  buildWordBank,
  contributions,
  pickFragment,
  splitName,
  yearToWords,
  type SpiritPerson,
} from "./wordbank";

const now = new Date("2026-10-20T00:00:00Z");

function person(name: string, death: string | null, occupations: string[] = [], deathPrecision = 11): SpiritPerson {
  return { qid: `Q${name.length}${death?.slice(0, 4) ?? "0"}`, name, death, deathPrecision, occupations };
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("yearToWords", () => {
  it("says years the way people say them", () => {
    expect(yearToWords(1890)).toBe("eighteen ninety");
    expect(yearToWords(1904)).toBe("nineteen oh four");
    expect(yearToWords(1800)).toBe("eighteen hundred");
    expect(yearToWords(1859)).toBe("eighteen fifty-nine");
    expect(yearToWords(1900)).toBe("nineteen hundred");
    expect(yearToWords(1911)).toBe("nineteen eleven");
    expect(yearToWords(1066)).toBe("ten sixty-six");
    expect(yearToWords(2000)).toBe("two thousand");
    expect(yearToWords(2005)).toBe("two thousand five");
    expect(yearToWords(2012)).toBe("twenty twelve");
    expect(yearToWords(476)).toBe("four hundred seventy-six");
    expect(yearToWords(0)).toBeNull();
    expect(yearToWords(-44)).toBeNull();
  });
});

describe("splitName", () => {
  it("handles the shapes in the snapshots", () => {
    expect(splitName("Washington Irving")).toEqual({ first: "Washington", last: "Irving" });
    expect(splitName("Alfred Iverson, Jr.")).toEqual({ first: "Alfred", last: "Iverson" });
    expect(splitName("Walter Percy Chrysler Sr.")).toEqual({ first: "Walter", last: "Chrysler" });
    expect(splitName("Lovick Pierce Thomas I")).toEqual({ first: "Lovick", last: "Thomas" });
    expect(splitName("S. B. Spencer")).toEqual({ first: null, last: "Spencer" });
    expect(splitName("John B. Gordon")).toEqual({ first: "John", last: "Gordon" });
    expect(splitName("Madame Restell")).toEqual({ first: null, last: "Restell" });
    expect(splitName("Margaret O'Connor Wilson")).toEqual({ first: "Margaret", last: "Wilson" });
    expect(splitName("Martin Van Buren")).toEqual({ first: "Martin", last: "Van Buren" });
    expect(splitName("Q6986296")).toEqual({ first: null, last: null });
    expect(splitName("")).toEqual({ first: null, last: null });
  });
});

describe("buildWordBank", () => {
  it("takes nothing from anyone who died less than 75 years ago", () => {
    const old = person("Eleanor Oldfield", "1899-03-01T00:00:00Z", ["lighthouse keeper"]);
    const recent = person("Zebulon Recentperson", "1990-06-01T00:00:00Z", ["astronaut"]);
    const borderline = person("Ophelia Borderline", "1952-01-01T00:00:00Z", ["typesetter"]); // 74 years in 2026
    const unknown = person("Quentin Nodate", null, ["cooper"]);
    const bank = buildWordBank([old, recent, borderline, unknown], now);
    const phrases = bankPhrases(bank).join(" | ").toLowerCase();

    expect(bank.eligibleCount).toBe(1);
    expect(bank.excludedCount).toBe(3);
    expect(bank.fullNames).toEqual(["Eleanor Oldfield"]);
    expect(bank.occupations).toEqual(["lighthouse keeper"]);
    expect(bank.years).toEqual(["eighteen ninety-nine"]);
    for (const word of [
      "zebulon", "recentperson", "astronaut", "nineteen ninety",
      "ophelia", "borderline", "typesetter", "nineteen fifty-two",
      "quentin", "nodate", "cooper",
    ]) {
      expect(phrases).not.toContain(word);
    }
  });

  it("takes words only from eligible people in the real snapshots", () => {
    for (const snap of [oakland, sleepyHollow] as CemeterySnapshot[]) {
      const people = snap.people as SpiritPerson[];
      const eligible = people.filter((p) => spiritEligible(p, now));
      const recent = people.filter((p) => !spiritEligible(p, now));
      expect(recent.length).toBeGreaterThan(0); // the test means something

      const allowed = new Set<string>(CONNECTIVES);
      for (const p of eligible) {
        const c = contributions(p);
        for (const w of [c.fullName, c.first, c.last, c.year, ...c.occupations]) if (w) allowed.add(w);
      }
      const bank = buildWordBank(people, now);
      const phrases = bankPhrases(bank);
      // Every phrase traces back to an eligible person or the fixed connectives.
      for (const phrase of phrases) expect(allowed.has(phrase), phrase).toBe(true);
      // Words that only recent people would bring (e.g. "Helmsley", "Maynard Jackson") are absent.
      for (const p of recent) {
        const c = contributions(p);
        for (const w of [c.fullName, c.first, c.last, c.year, ...c.occupations]) {
          if (w && !allowed.has(w)) expect(phrases, `${p.name} → ${w}`).not.toContain(w);
        }
      }
      expect(bank.eligibleCount).toBe(eligible.length);
    }
  });

  it("keeps Washington Irving and leaves out Leona Helmsley at Sleepy Hollow", () => {
    const bank = buildWordBank(sleepyHollow.people as SpiritPerson[], now);
    expect(bank.fullNames).toContain("Washington Irving");
    expect(bank.years).toContain("eighteen fifty-nine");
    expect(bankPhrases(bank).some((p) => /helmsley/i.test(p))).toBe(false);
  });

  it("skips death years coarser than a year", () => {
    const bank = buildWordBank([person("Decade Person", "1850-01-01T00:00:00Z", [], 8)], now);
    expect(bank.years).toEqual([]);
    expect(bank.surnames).toEqual(["Person"]);
  });

  it("drops occupations longer than three words", () => {
    const bank = buildWordBank(
      [person("Ada Long", "1900-01-01T00:00:00Z", ["United States Secretary of State", "infectious disease physician"])],
      now,
    );
    expect(bank.occupations).toEqual(["infectious disease physician"]);
  });
});

describe("pickFragment", () => {
  it("always returns 1–3 words from the bank", () => {
    const bank = buildWordBank(oakland.people as SpiritPerson[], now);
    const allowed = bankPhrases(bank);
    const rng = mulberry(42);
    for (let i = 0; i < 2000; i++) {
      const f = pickFragment(bank, rng);
      const n = f.split(/\s+/).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      // Either a phrase, or connective + name; every word comes from some phrase.
      for (const w of f.split(/\s+/)) {
        expect(allowed.some((p) => p.split(/\s+/).includes(w)), w).toBe(true);
      }
    }
  });

  it("falls back to connectives when nobody is eligible", () => {
    const bank = buildWordBank([person("New Person", "2020-01-01T00:00:00Z")], now);
    const f = pickFragment(bank, mulberry(1));
    expect(CONNECTIVES as readonly string[]).toContain(f);
  });
});
