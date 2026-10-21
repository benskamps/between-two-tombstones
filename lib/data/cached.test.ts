import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CemeterySearchResult } from "./types";

const next = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("next/cache", () => next);
const wikidata = vi.hoisted(() => ({
  fetchBurials: vi.fn(),
  fetchCemeteryFacts: vi.fn(),
  fetchNearby: vi.fn(),
  fetchSearchOnce: vi.fn(),
}));
vi.mock("./wikidata", () => wikidata);

const { cachedSearch } = await import("./cached");

const oakland = { qid: "Q2008469", name: "Oakland Cemetery", burials: 115 } as CemeterySearchResult;

beforeEach(() => vi.clearAllMocks());

describe("cachedSearch", () => {
  it("keeps matches for weeks", async () => {
    wikidata.fetchSearchOnce.mockResolvedValue([oakland]);
    expect(await cachedSearch("oakland")).toEqual([oakland]);
    expect(next.cacheLife.mock.calls).toEqual([["weeks"]]);
  });

  it("keeps no matches for minutes only, since MWAPI answers an upstream failure with no rows", async () => {
    wikidata.fetchSearchOnce.mockResolvedValue([]);
    expect(await cachedSearch("oakland cemetery")).toEqual([]);
    expect(next.cacheLife.mock.calls).toEqual([["minutes"]]);
  });

  it("stores nothing when the search throws", async () => {
    wikidata.fetchSearchOnce.mockRejectedValue(new Error("down"));
    await expect(cachedSearch("oakland")).rejects.toThrow("down");
    expect(next.cacheLife).not.toHaveBeenCalled();
  });
});
