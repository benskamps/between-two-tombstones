import { describe, expect, it } from "vitest";
import { errorMessage, parseDeckResponse, toProfile } from "./client";

const card = (qid: string, name: string, extra: Record<string, unknown> = {}) => ({
  qid,
  name,
  lat: 33.75,
  lon: -84.37,
  distanceKm: 1,
  heritage: [],
  typeIds: ["Q39614"],
  types: [],
  notable: { count: 0, top: [] },
  ...extra,
});

describe("parseDeckResponse (browser re-check)", () => {
  it("drops family, private, pet and abandoned cemeteries even if the API sent them", () => {
    const deck = parseDeckResponse({
      cards: [
        card("Q1", "Oakland Cemetery"),
        card("Q2", "Hightower Family Cemetery"),
        card("Q3", "Quiet Acres", { typeIds: ["Q39614", "Q107684101"] }),
        card("Q4", "Fido's Rest", { types: ["pet cemetery"] }),
        card("Q5", "Westview Cemetery"),
      ],
      total: 5,
    })!;
    expect(deck.cards.map((c) => c.name)).toEqual(["Oakland Cemetery", "Westview Cemetery"]);
  });

  it("drops malformed cards and duplicates, and isn't fooled by non-decks", () => {
    const deck = parseDeckResponse({ cards: [card("Q1", "A"), card("Q1", "A again"), { qid: "x" }, null] })!;
    expect(deck.cards.map((c) => c.qid)).toEqual(["Q1"]);
    expect(parseDeckResponse({ error: { source: "Wikidata", message: "x" } })).toBeNull();
    expect(parseDeckResponse("nope")).toBeNull();
  });

  it("only accepts Commons images", () => {
    expect(toProfile(card("Q1", "A", { image: "https://evil.example/x.jpg" }))!.image).toBeNull();
    const ok = "https://commons.wikimedia.org/wiki/Special:FilePath/X.jpg?width=500";
    expect(toProfile(card("Q1", "A", { image: ok }))!.image).toBe(ok);
  });

  it("treats a notable person with no recent flag as recent (name only)", () => {
    const p = toProfile(card("Q1", "A", { notable: { count: 1, top: [{ qid: "Q9", name: "Someone", deathYear: 1900 }] } }))!;
    expect(p.notable!.top[0].recent).toBe(true);
  });
});

describe("errorMessage", () => {
  it("names the source the API named", () => {
    expect(errorMessage({ error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute." } }, 502)).toBe(
      "Couldn't reach Wikidata. Try again in a minute.",
    );
    expect(errorMessage({ error: { source: "Wikipedia" } }, 502)).toBe("Couldn't reach Wikipedia. Try again in a minute.");
    expect(errorMessage(null, 504)).toBe("Couldn't reach Wikidata. Try again in a minute.");
  });
});
