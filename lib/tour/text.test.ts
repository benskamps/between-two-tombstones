import { describe, expect, it } from "vitest";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import { cleanExtract, isQidName, nameFromWikiTitle, personName } from "./text";

// The two extracts the review found on Oakland Cemetery cards (F19), verbatim from prod.
const GORDON =
  "John Brown Gordon ((1832-02-06)February 6, 1832 – (1904-01-09)January 9, 1904) was an American politician, Confederate States Army general, and attorney.";
const COLLIER =
  "Charles Augustus Collier (; July 19, 1848 – September 28, 1900) was an American banker, lawyer, and politician who served as Mayor of Atlanta.";

describe("cleanExtract", () => {
  it("strips the hidden microformat dates and the doubled parenthesis they leave (John B. Gordon)", () => {
    expect(cleanExtract(GORDON)).toBe(
      "John Brown Gordon (February 6, 1832 – January 9, 1904) was an American politician, Confederate States Army general, and attorney.",
    );
  });

  it('turns "(; " left by a removed pronunciation into "(" (Charles Collier)', () => {
    expect(cleanExtract(COLLIER)).toBe(
      "Charles Augustus Collier (July 19, 1848 – September 28, 1900) was an American banker, lawyer, and politician who served as Mayor of Atlanta.",
    );
    expect(cleanExtract("Ann Smith ( ;  born 1801) was")).toBe("Ann Smith (born 1801) was");
    expect(cleanExtract("Ivan Petrov (, IPA) was")).toBe("Ivan Petrov (IPA) was");
  });

  it("drops empty parentheses and doubled spaces", () => {
    expect(cleanExtract("Jane Doe () was a poet.")).toBe("Jane Doe was a poet.");
    expect(cleanExtract("Jane Doe (;) was a poet.")).toBe("Jane Doe was a poet.");
    expect(cleanExtract("Jane Doe ((1801-02-03)) was a poet.")).toBe("Jane Doe was a poet.");
    expect(cleanExtract("Jane Doe (), born here, was")).toBe("Jane Doe, born here, was");
    expect(cleanExtract("one  two   three")).toBe("one two three");
  });

  it("leaves normal parentheses, nesting and paragraphs alone", () => {
    const normal = [
      "Margaret Munnerlyn Mitchell (November 8, 1900 – August 16, 1949) was an American novelist and journalist.",
      "Bobby Jones (golfer) won the Grand Slam (all four majors) in 1930.",
      "He served (with distinction (and some luck)) until 1865.",
      "The (1832) edition sold out; the 1832-02-06 entry is plain text.",
      "Population (2020): 12,345 (est.)",
    ];
    for (const s of normal) expect(cleanExtract(s)).toBe(s);
    expect(cleanExtract(`${GORDON}\nHe was buried at Oakland.\n\nSecond paragraph (here).`)).toBe(
      `${cleanExtract(GORDON)}\nHe was buried at Oakland.\n\nSecond paragraph (here).`,
    );
    expect(cleanExtract("")).toBe("");
  });

  it("cleans every extract in the saved Oakland copy; beyond doubled spaces, only the two broken ones change", () => {
    const people = (oakland as { people: { name: string; wikipedia: { extract: string } | null }[] }).people;
    const spacesOnly = (s: string) =>
      s
        .replace(/ {2,}/g, " ")
        .split("\n")
        .map((l) => l.trim())
        .join("\n");
    const changed = people.filter((p) => p.wikipedia && cleanExtract(p.wikipedia.extract) !== spacesOnly(p.wikipedia.extract));
    expect(changed.map((p) => p.name).sort()).toEqual(["Charles Collier", "John B. Gordon"]);
    for (const p of people) {
      if (!p.wikipedia) continue;
      const t = cleanExtract(p.wikipedia.extract);
      expect(t, p.name).not.toMatch(/\(\d{4}-\d{2}-\d{2}\)|\(\s*;|\(\(|\(\s*\)| {2}/);
    }
  });
});

describe("names (F20)", () => {
  it("treats a QID-shaped or missing name as no name", () => {
    for (const id of ["Q16162799", "Q1", " Q6986296 ", "", "  ", undefined, null]) expect(isQidName(id), String(id)).toBe(true);
    for (const name of ["Margaret Mitchell", "Q", "Quincy Adams", "Q-ship captain", "Q1 Smith", "John Q. Public"]) expect(isQidName(name), name).toBe(false);
  });

  it("uses the English Wikipedia title, without a trailing disambiguator, when the label is a bare QID", () => {
    expect(nameFromWikiTitle("Nedom L. Angier (politician)")).toBe("Nedom L. Angier");
    expect(nameFromWikiTitle("Ira_O._McDaniel")).toBe("Ira O. McDaniel");
    expect(nameFromWikiTitle("Bobby Jones (golfer)")).toBe("Bobby Jones");
    expect(nameFromWikiTitle("Q42")).toBeNull();
    expect(nameFromWikiTitle(null)).toBeNull();
    expect(personName("Q6986296", "Nedom L. Angier")).toBe("Nedom L. Angier");
    expect(personName("Q6986296", null)).toBeNull();
    expect(personName("Margaret Mitchell", "Something else")).toBe("Margaret Mitchell");
    // Only a trailing disambiguator goes; parentheses inside a title stay.
    expect(nameFromWikiTitle("Jane (Jenny) Doe")).toBe("Jane (Jenny) Doe");
  });
});
