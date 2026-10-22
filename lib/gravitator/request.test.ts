import { describe, expect, it, vi } from "vitest";
import { buildDeck, DeckSourceError, NOTE_WIKIPEDIA } from "./deck";
import burials from "./fixtures/atlanta-burials.json";
import profiles from "./fixtures/atlanta-profiles.json";
import type { ExtractsJson, SparqlJson } from "./parse";
import { handleDeckRequest, parseDeckParams } from "./request";
import type { Deck } from "./types";

const round = (lat: number, lon: number) => ({ lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 });
const deck = (notes: Deck["notes"] = []): Deck => ({
  center: { lat: 33.75, lon: -84.37 },
  radiusKm: 25,
  fetchedAt: "2026-10-20T00:00:00.000Z",
  total: 0,
  excluded: 0,
  cards: [],
  notes,
});
const URL_OK = "http://localhost/api/gravitator?lat=33.7486&lon=-84.3733";

describe("parseDeckParams", () => {
  it("needs numeric lat and lon in range", () => {
    expect(parseDeckParams(new URLSearchParams("lat=33.7&lon=-84.3"))).toEqual({ lat: 33.7, lon: -84.3, radiusKm: 25 });
    expect(parseDeckParams(new URLSearchParams("lat=&lon=1"))).toHaveProperty("error");
    expect(parseDeckParams(new URLSearchParams("lat=91&lon=1"))).toHaveProperty("error");
    expect(parseDeckParams(new URLSearchParams("lat=abc&lon=1"))).toHaveProperty("error");
  });

  it("allows 25 or 50 km only", () => {
    expect(parseDeckParams(new URLSearchParams("lat=1&lon=1&radius=50"))).toMatchObject({ radiusKm: 50 });
    expect(parseDeckParams(new URLSearchParams("lat=1&lon=1&radius=5000"))).toMatchObject({ radiusKm: 25 });
  });
});

describe("handleDeckRequest", () => {
  it("asks for the deck at the point rounded to 2 decimals", async () => {
    const get = vi.fn(async () => deck());
    const res = await handleDeckRequest(URL_OK + "&radius=50", get, round);
    expect(res.status).toBe(200);
    expect(get).toHaveBeenCalledWith(33.75, -84.37, 50);
    expect(res.headers.get("cache-control")).toContain("max-age=600");
  });

  it("keeps a deck with notes in browser caches for a minute only", async () => {
    const res = await handleDeckRequest(URL_OK, async () => deck([{ source: "Wikipedia", message: "x" }]), round);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("a Wikipedia 200 with an error body leaves a note, so the deck is cached for a minute, not days", async () => {
    // Red team P2-2: this body used to parse as "no bios" with no note.
    const ratelimited = async () => ({ error: { code: "ratelimited", info: "You've exceeded your rate limit." } }) as ExtractsJson;
    const getDeck = (lat: number, lon: number, radiusKm: number) =>
      buildDeck({ lat, lon }, radiusKm, { sparql: async (_q, method) => (method === "GET" ? profiles : burials) as SparqlJson, extracts: ratelimited });
    const res = await handleDeckRequest(URL_OK, getDeck, round);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Deck;
    expect(body.notes).toEqual([{ source: "Wikipedia", message: NOTE_WIKIPEDIA }]);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("names Wikidata when the deck can't be built", async () => {
    const res = await handleDeckRequest(
      URL_OK,
      async () => {
        throw new DeckSourceError("Couldn't reach Wikidata. Try again in a minute.");
      },
      round,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute." },
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("names Wikidata even when the error's message was replaced (production cache errors)", async () => {
    const res = await handleDeckRequest(URL_OK, async () => Promise.reject(new Error("An error occurred")), round);
    expect((await res.json()).error.source).toBe("Wikidata");
  });

  it("simulates a Wikidata outage with DISABLE_WIKIDATA=1 (Gate 8)", async () => {
    const get = vi.fn(async () => deck());
    const res = await handleDeckRequest(URL_OK, get, round, { DISABLE_WIKIDATA: "1" });
    expect(res.status).toBe(503);
    expect((await res.json()).error.source).toBe("Wikidata");
    expect(get).not.toHaveBeenCalled();
  });

  it("rejects a bad query with 400 and doesn't ask anyone", async () => {
    const get = vi.fn(async () => deck());
    const res = await handleDeckRequest("http://localhost/api/gravitator?lat=x", get, round);
    expect(res.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });
});
