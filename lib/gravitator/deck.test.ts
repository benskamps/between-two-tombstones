import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDeck, DeckSourceError, NOTE_BURIALS, NOTE_WIKIPEDIA, type DeckFetcher } from "./deck";
import type { ExtractsJson, SparqlJson } from "./parse";
import { DECK_CAP } from "./types";

// Recorded live 2026-10-20 (see parse.test.ts).
function fixture(name: string): SparqlJson {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"));
}
const profiles = fixture("atlanta-profiles.json");
const burials = fixture("atlanta-burials.json");
const NOW = new Date("2026-10-20T12:00:00Z");
const ATLANTA = { lat: 33.75, lon: -84.37 };

/** Synthetic extracts: one sentence pair per requested title. */
function fakeExtracts(titles: string[]): ExtractsJson {
  return { query: { pages: titles.map((t) => ({ title: t, extract: `${t} is a cemetery. It has graves. More here.` })) } };
}

type Calls = { sparql: string[]; extracts: string[][] };
function fetcher(over: Partial<DeckFetcher> = {}): { f: DeckFetcher; calls: Calls } {
  const calls: Calls = { sparql: [], extracts: [] };
  const f: DeckFetcher = {
    async sparql(query, method) {
      calls.sparql.push(method);
      if (over.sparql) return over.sparql(query, method);
      return query.includes("wikibase:around") ? profiles : burials;
    },
    async extracts(titles) {
      calls.extracts.push(titles);
      if (over.extracts) return over.extracts(titles);
      return fakeExtracts(titles);
    },
  };
  return { f, calls };
}

describe("buildDeck", () => {
  it("makes one profiles query, one burials query and batched Wikipedia requests", async () => {
    const { f, calls } = fetcher();
    const deck = await buildDeck(ATLANTA, 25, f, NOW);
    expect(calls.sparql).toEqual(["GET", "POST"]);
    // 8 cemeteries near Atlanta have an English article: one request.
    expect(calls.extracts).toHaveLength(1);
    expect(calls.extracts[0].length).toBeLessThanOrEqual(20);
    expect(deck.notes).toEqual([]);
    expect(deck.total).toBe(217);
    expect(deck.excluded).toBe(29);
    expect(DECK_CAP).toBeGreaterThanOrEqual(217);
    expect(deck.cards).toHaveLength(217);
  });

  it("puts the most notable burials first, then the nearest, with bios attached", async () => {
    const deck = await buildDeck(ATLANTA, 25, fetcher().f, NOW);
    const [oak, westview] = deck.cards;
    expect(oak.name).toBe("Oakland Cemetery");
    expect(oak.notable).toEqual({
      count: 114,
      top: [
        { qid: "Q173540", name: "Margaret Mitchell", deathYear: 1949, recent: false },
        { qid: "Q437526", name: "Bobby Jones", deathYear: 1971, recent: false },
        { qid: "Q118774", name: "John B. Gordon", deathYear: 1904, recent: false },
      ],
    });
    expect(oak.bio?.url).toBe("https://en.wikipedia.org/wiki/Oakland_Cemetery_(Atlanta)");
    expect(westview.name).toBe("Westview Cemetery");
    expect(deck.cards.filter((c) => c.bio).length).toBe(8);
    // Filter-only fields don't leak into cards.
    expect(oak).not.toHaveProperty("nonPublic");
    expect(oak).not.toHaveProperty("dissolved");
  });

  it("never deals a family, private, pet or abandoned cemetery", async () => {
    const deck = await buildDeck(ATLANTA, 25, fetcher().f, NOW);
    expect(deck.cards.filter((c) => /family|private|pet cemetery|abandoned/i.test(c.name))).toEqual([]);
  });

  it("throws a Wikidata error when the profiles query fails, and asks nothing else", async () => {
    const { f, calls } = fetcher({
      sparql: async () => {
        throw new Error("429 from query.wikidata.org");
      },
    });
    await expect(buildDeck(ATLANTA, 25, f, NOW)).rejects.toBeInstanceOf(DeckSourceError);
    expect(calls.sparql).toHaveLength(1);
    expect(calls.extracts).toHaveLength(0);
  });

  it("still deals the deck when the burials query fails, with a note and unknown counts", async () => {
    const { f } = fetcher({
      sparql: async (q) => {
        if (q.includes("wikibase:around")) return profiles;
        throw new Error("timeout");
      },
    });
    const deck = await buildDeck(ATLANTA, 25, f, NOW);
    expect(deck.notes).toEqual([{ source: "Wikidata", message: NOTE_BURIALS }]);
    expect(deck.cards.every((c) => c.notable === null)).toBe(true);
    // Without counts the order is by distance.
    expect(deck.cards[0].name).toBe("Oakland Cemetery");
    expect(deck.cards[1].distanceKm).toBeGreaterThanOrEqual(deck.cards[0].distanceKm);
  });

  it("still deals the deck when Wikipedia rate-limits us, and stops asking after the first refusal", async () => {
    const many = {
      results: {
        bindings: Array.from({ length: 45 }, (_, i) => ({
          c: { type: "uri", value: `http://www.wikidata.org/entity/Q${100 + i}` },
          name: { type: "literal", value: `Cemetery ${i}` },
          coord: { type: "literal", value: "Point(-84.38 33.75)" },
          distance: { type: "literal", value: String(i) },
          enwiki: { type: "literal", value: `Cemetery ${i}` },
        })),
      },
    };
    const { f, calls } = fetcher({
      sparql: async (q) => (q.includes("wikibase:around") ? many : { results: { bindings: [] } }),
      extracts: async () => {
        throw new Error("429 from en.wikipedia.org");
      },
    });
    const deck = await buildDeck(ATLANTA, 25, f, NOW);
    expect(calls.extracts).toHaveLength(1);
    expect(deck.notes).toEqual([{ source: "Wikipedia", message: NOTE_WIKIPEDIA }]);
    expect(deck.cards).toHaveLength(45);
    expect(deck.cards.every((c) => c.bio === null)).toBe(true);
  });

  it("adds the Wikipedia note when Wikipedia answers 200 with an error body (so the deck is kept for minutes)", async () => {
    const { f, calls } = fetcher({
      extracts: async () => ({ error: { code: "ratelimited", info: "You've exceeded your rate limit." } }) as ExtractsJson,
    });
    const deck = await buildDeck(ATLANTA, 25, f, NOW);
    expect(deck.notes).toEqual([{ source: "Wikipedia", message: NOTE_WIKIPEDIA }]);
    expect(calls.extracts).toHaveLength(1); // stops asking after the refusal
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(deck.cards.every((c) => c.bio === null)).toBe(true);
  });

  it("asks Wikipedia in batches of 20, at most 3 batches", async () => {
    const many = {
      results: {
        bindings: Array.from({ length: 70 }, (_, i) => ({
          c: { type: "uri", value: `http://www.wikidata.org/entity/Q${100 + i}` },
          name: { type: "literal", value: `Cemetery ${i}` },
          coord: { type: "literal", value: "Point(-84.38 33.75)" },
          distance: { type: "literal", value: String(i) },
          enwiki: { type: "literal", value: `Cemetery ${i}` },
        })),
      },
    };
    const { f, calls } = fetcher({
      sparql: async (q) => (q.includes("wikibase:around") ? many : { results: { bindings: [] } }),
    });
    const deck = await buildDeck(ATLANTA, 25, f, NOW);
    expect(calls.extracts.map((b) => b.length)).toEqual([20, 20, 20]);
    expect(deck.cards.filter((c) => c.bio).length).toBe(60);
  });

  it("returns an empty deck (not an error) when there truly is nothing within the radius", async () => {
    const { f, calls } = fetcher({ sparql: async () => ({ results: { bindings: [] } }) });
    const deck = await buildDeck({ lat: 0, lon: -140 }, 25, f, NOW);
    expect(deck.cards).toEqual([]);
    expect(deck.total).toBe(0);
    expect(calls.sparql).toHaveLength(1);
    expect(calls.extracts).toHaveLength(0);
  });
});
