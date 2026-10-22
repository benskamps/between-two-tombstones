// K1 / red-team P0-2: a share link whose "cemetery" is not one (Mausoleum of
// Mao Zedong, Lenin's Mausoleum, a person) must never name it. Runs the real
// share loader and the tour's real loader (lib/data/load.ts); only the cache
// layer is replaced, and it answers with the recorded Wikidata facts for the
// mausoleum (isCemetery false) and a synthetic burial row for the man in it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import mausoleumBurialsJson from "@/lib/data/__fixtures__/sparql-burials-Q1154819.synthetic.json";
import mausoleumFactsJson from "@/lib/data/__fixtures__/sparql-facts-Q1154819.json";
import oaklandFactsJson from "@/lib/data/__fixtures__/sparql-facts-Q2008469.json";
import { flattenBindings, parseBurialRows, parseCemeteryFacts } from "@/lib/data/wikidata";

const cached = vi.hoisted(() => ({
  cachedBurials: vi.fn(),
  cachedCemeteryFacts: vi.fn(),
  cachedExtracts: vi.fn(),
  cachedNearby: vi.fn(),
  cachedSearch: vi.fn(),
  cachedOsm: vi.fn(),
}));
vi.mock("@/lib/data/cached", () => cached);

const { loadShare } = await import("./load");
const { shareMetadata } = await import("./metadata");
const { shareDescription, shareSheetText, shareTitle, ctaLabel } = await import("./model");

const MAUSOLEUM = "Q1154819";
const MAO = "Q5816";
const ROOM = "KXMPRT";
/** Words that would name the place or the man buried there. */
const NAMES = /mao|zedong|mausoleum|chairman/i;

beforeEach(() => {
  for (const fn of Object.values(cached)) fn.mockReset();
  // As Wikidata answers today: one burial, a real item, but not a cemetery.
  cached.cachedBurials.mockResolvedValue({ rows: parseBurialRows(flattenBindings(mausoleumBurialsJson)), fetchedAt: "2026-10-22T00:00:00Z" });
  cached.cachedCemeteryFacts.mockImplementation(async (qid: string) =>
    parseCemeteryFacts(qid, flattenBindings(qid === MAUSOLEUM ? mausoleumFactsJson : oaklandFactsJson)),
  );
  cached.cachedExtracts.mockResolvedValue({
    "Mao Zedong": { title: "Mao Zedong", extract: "Mao Zedong was a Chinese politician.", url: "https://en.wikipedia.org/wiki/Mao_Zedong" },
  });
});

describe("a share link at a place that isn't a cemetery (K1)", () => {
  it("the recorded facts say it exists but is not a cemetery, so the tour's loader finds no cemetery", () => {
    expect(flattenBindings(mausoleumFactsJson)[0]).toMatchObject({ cLabel: "Mausoleum of Mao Zedong", isCemetery: "false" });
    expect(parseCemeteryFacts(MAUSOLEUM, flattenBindings(mausoleumFactsJson))).toBeNull();
  });

  for (const kind of ["seance", "party"] as const) {
    it(`a ${kind} invite still works, but its card, title, description and share text name no one`, async () => {
      const ref = kind === "seance" ? ({ kind, cemetery: MAUSOLEUM, room: ROOM, bank: null } as const) : ({ kind, cemetery: MAUSOLEUM, room: ROOM } as const);
      const load = await loadShare(ref);
      expect(load).toEqual({ status: "ok", card: { kind, room: ROOM, cemetery: null } });
      if (load.status !== "ok") throw new Error("unreachable");
      const words = [shareTitle(load.card), shareDescription(load.card), shareSheetText(load.card), ctaLabel(kind, null), JSON.stringify(load.card)];
      for (const w of words) expect(w).not.toMatch(NAMES);
      expect(shareTitle(load.card)).toBe(kind === "seance" ? "Séance" : "Graveyard party");
      // The unfurl (og:title, og:description) is the same unnamed card.
      const meta = shareMetadata(ref, load);
      expect(JSON.stringify(meta)).not.toMatch(NAMES);
      expect(meta.openGraph?.title).toBe(shareTitle(load.card));
    });
  }

  it("a stop or tour link there is not found: the same 404 as a person Wikidata doesn't list at a cemetery", async () => {
    expect(await loadShare({ kind: "stop", cemetery: MAUSOLEUM, person: MAO })).toEqual({ status: "not-found" });
    expect(await loadShare({ kind: "tour", cemetery: MAUSOLEUM })).toEqual({ status: "not-found" });
  });

  it("a real cemetery is still named on its room card (recorded Oakland facts)", async () => {
    const load = await loadShare({ kind: "party", cemetery: "Q2008469", room: ROOM });
    expect(load).toMatchObject({ status: "ok", card: { kind: "party", cemetery: { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta" } } });
  });
});
