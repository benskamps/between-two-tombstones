import { describe, expect, it } from "vitest";
import { makeRiddleRound, redactName, riddleEligiblePeople, type RiddlePerson } from "./whoami";

const NOW = new Date("2026-10-21T00:00:00Z");

const SAMPLE_PEOPLE: RiddlePerson[] = [
  {
    qid: "Q173540",
    name: "Margaret Mitchell",
    description: "American novelist and journalist",
    birth: "1900-11-08T00:00:00Z",
    birthPrecision: 11,
    death: "1949-08-16T00:00:00Z",
    deathPrecision: 11,
    occupations: ["novelist", "journalist"],
    wikipedia: {
      title: "Margaret Mitchell",
      url: "https://en.wikipedia.org/wiki/Margaret_Mitchell",
      extract: "Margaret Munnerlyn Mitchell was an American novelist and journalist who wrote Gone with the Wind.",
    },
  },
  {
    qid: "Q181667",
    name: "Washington Irving",
    description: "American short-story writer, essayist, biographer, historian",
    birth: "1783-04-03T00:00:00Z",
    birthPrecision: 11,
    death: "1859-11-28T00:00:00Z",
    deathPrecision: 11,
    occupations: ["writer", "historian", "diplomat"],
    wikipedia: {
      title: "Washington Irving",
      url: "https://en.wikipedia.org/wiki/Washington_Irving",
      extract: "Washington Irving was an American short-story writer, essayist, biographer, historian, and diplomat.",
    },
  },
  {
    qid: "Q484265",
    name: "Andrew Carnegie",
    description: "Scottish-American industrialist and philanthropist",
    birth: "1835-11-25T00:00:00Z",
    birthPrecision: 11,
    death: "1919-08-11T00:00:00Z",
    deathPrecision: 11,
    occupations: ["industrialist", "philanthropist"],
    wikipedia: {
      title: "Andrew Carnegie",
      url: "https://en.wikipedia.org/wiki/Andrew_Carnegie",
      extract: "Andrew Carnegie was a Scottish-American industrialist and philanthropist who led the expansion of the American steel industry.",
    },
  },
  {
    qid: "Q310199",
    name: "Bobby Jones",
    description: "American amateur golfer",
    birth: "1902-03-17T00:00:00Z",
    birthPrecision: 11,
    death: "1971-12-18T00:00:00Z",
    deathPrecision: 11,
    occupations: ["golfer", "lawyer"],
    wikipedia: {
      title: "Bobby Jones (golfer)",
      url: "https://en.wikipedia.org/wiki/Bobby_Jones_(golfer)",
      extract: "Robert Tyre Jones Jr. was an American amateur golfer who founded the Masters Tournament.",
    },
  },
  {
    qid: "Q456789",
    name: "Maynard Jackson",
    description: "Mayor of Atlanta",
    birth: "1938-03-23T00:00:00Z",
    birthPrecision: 11,
    death: "2003-06-23T00:00:00Z",
    deathPrecision: 11,
    occupations: ["politician"],
    wikipedia: {
      title: "Maynard Jackson",
      url: "https://en.wikipedia.org/wiki/Maynard_Jackson",
      extract: "Maynard Holbrook Jackson Jr. was an American politician and the first Black mayor of Atlanta.",
    },
  },
];

describe("whoami riddle engine", () => {
  it("redacts full name and tokens from clues", () => {
    const out = redactName(
      "Margaret Munnerlyn Mitchell was an American novelist.",
      "Margaret Mitchell",
    );
    expect(out).not.toMatch(/Margaret/i);
    expect(out).not.toMatch(/Mitchell/i);
    expect(out).toContain("[…]");
  });

  it("excludes deaths within 25 years under the respect rule", () => {
    const eligible = riddleEligiblePeople(SAMPLE_PEOPLE, NOW);
    expect(eligible.map((p) => p.name)).not.toContain("Maynard Jackson");
    expect(eligible).toHaveLength(4);
  });

  it("builds 3 distinct clues and a 4-option round containing the answer", () => {
    const eligible = riddleEligiblePeople(SAMPLE_PEOPLE, NOW);
    const round = makeRiddleRound(eligible, 0)!;
    expect(round).not.toBeNull();
    expect(round.clues).toHaveLength(3);
    expect(round.options).toHaveLength(4);
    expect(round.options.map((o) => o.qid)).toContain(round.answer.qid);
    for (const clue of round.clues) {
      expect(clue).not.toContain(round.answer.name);
    }
  });
});
