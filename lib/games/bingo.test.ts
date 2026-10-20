import { describe, expect, it } from "vitest";
import {
  CENTER,
  LINES,
  bingoMessage,
  completedLines,
  makeCard,
  makeRoomCode,
  normalizeRoomCode,
  partyPath,
  partySeed,
} from "./bingo";
import { hashString, mulberry32, seededRandom } from "./rng";
import { parseMarks } from "./storage";
import { FREE_SQUARE, SYMBOLS, symbolById } from "./symbols";

describe("symbols", () => {
  it("has at least 30 carved symbols with unique ids and one-line meanings", () => {
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SYMBOLS.map((s) => s.id)).size).toBe(SYMBOLS.length);
    for (const s of SYMBOLS) {
      expect(s.meaning.length).toBeGreaterThan(5);
      expect(s.meaning.length).toBeLessThanOrEqual(70);
      expect(s.meaning).not.toContain("\n");
      expect(s.label.length).toBeLessThanOrEqual(18);
    }
  });
  it("includes the ones the plan names", () => {
    for (const id of [
      "lamb", "weeping-willow", "draped-urn", "broken-column", "clasped-hands", "winged-hourglass",
      "inverted-torch", "anchor", "square-compass", "three-links", "tree-stump", "gar-star", "white-bronze",
    ]) {
      expect(symbolById(id), id).toBeDefined();
    }
  });
});

describe("seeded randomness", () => {
  it("is deterministic per seed", () => {
    const a = seededRandom("party:KXMPRT");
    const b = seededRandom("party:KXMPRT");
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    expect(hashString("a")).not.toBe(hashString("b"));
    const r = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("makeCard", () => {
  it("gives the same card for the same seed", () => {
    expect(makeCard("party:KXMPRT")).toEqual(makeCard("party:KXMPRT"));
    expect(makeCard("solo:abc123")).toEqual(makeCard("solo:abc123"));
  });

  it("gives different cards for different seeds", () => {
    const cards = new Set<string>();
    for (let i = 0; i < 200; i++) cards.add(makeCard(`party:${i}`).join(","));
    expect(cards.size).toBe(200);
    expect(makeCard("party:AAAAAA")).not.toEqual(makeCard("party:AAAAAB"));
  });

  it("always has R.I.P. in the centre and no duplicates", () => {
    for (let i = 0; i < 300; i++) {
      const card = makeCard(`seed-${i}`);
      expect(card).toHaveLength(25);
      expect(card[CENTER]).toBe(FREE_SQUARE.id);
      expect(card.filter((id) => id === FREE_SQUARE.id)).toHaveLength(1);
      expect(new Set(card).size).toBe(25);
      for (const id of card) expect(symbolById(id), id).toBeDefined();
    }
  });

  it("is pinned: a known seed keeps its card across releases", () => {
    // If this changes (new symbols, new shuffle), party links already shared
    // would show different cards on phones running different versions.
    expect(makeCard("party:KXMPRT")).toMatchInlineSnapshot(`
      [
        "clasped-hands",
        "broken-column",
        "hand-down",
        "cherub",
        "anchor",
        "all-seeing-eye",
        "celtic-cross",
        "lamb",
        "lily",
        "hand-up",
        "draped-urn",
        "white-bronze",
        "rip",
        "tree-stump",
        "star-of-david",
        "chalice",
        "scythe",
        "fern",
        "trumpet",
        "gar-star",
        "skull-crossbones",
        "blessing-hands",
        "oak-leaves",
        "square-compass",
        "butterfly",
      ]
    `);
  });
});

describe("bingo detection", () => {
  it("has 12 lines", () => {
    expect(LINES).toHaveLength(12);
  });

  it("finds nothing on a fresh card", () => {
    expect(completedLines(new Set())).toEqual([]);
    expect(bingoMessage([])).toBeNull();
  });

  it("finds a row", () => {
    const lines = completedLines(new Set([0, 1, 2, 3, 4]));
    expect(lines.map((l) => [l.kind, l.index])).toEqual([["row", 0]]);
    expect(bingoMessage(lines)).toBe("Bingo! You completed row 1.");
  });

  it("finds a column", () => {
    const lines = completedLines(new Set([4, 9, 14, 19, 24]));
    expect(lines.map((l) => [l.kind, l.index])).toEqual([["column", 4]]);
  });

  it("counts the free centre square", () => {
    // Row 3 is 10–14; the centre (12) is free.
    expect(completedLines(new Set([10, 11, 13, 14])).map((l) => [l.kind, l.index])).toEqual([["row", 2]]);
    // Diagonals cross the centre too.
    expect(completedLines(new Set([0, 6, 18, 24])).map((l) => [l.kind, l.index])).toEqual([["diagonal", 0]]);
    expect(completedLines(new Set([4, 8, 16, 20])).map((l) => [l.kind, l.index])).toEqual([["diagonal", 1]]);
  });

  it("does not call four in a row a bingo", () => {
    expect(completedLines(new Set([0, 1, 2, 3]))).toEqual([]);
    expect(completedLines(new Set([0, 5, 10, 15]))).toEqual([]);
  });

  it("lists several lines at once", () => {
    const lines = completedLines(new Set([0, 1, 2, 3, 4, 6, 18, 24]));
    expect(bingoMessage(lines)).toBe("Bingo! You completed row 1 and the diagonal from top left.");
  });
});

describe("room codes", () => {
  it("makes six readable letters", () => {
    const code = makeRoomCode(mulberry32(7));
    expect(code).toMatch(/^[A-HJKMNP-Z]{6}$/);
  });
  it("normalizes what people type", () => {
    expect(normalizeRoomCode("kxm-prt")).toBe("KXMPRT");
    expect(normalizeRoomCode(" KXM PRT ")).toBe("KXMPRT");
    expect(normalizeRoomCode("KXMPR")).toBeNull();
    expect(normalizeRoomCode("KXMPRO")).toBeNull(); // O isn't used
    expect(normalizeRoomCode(null)).toBeNull();
  });
  it("builds the party seed and link", () => {
    expect(partySeed("KXMPRT")).toBe("party:KXMPRT");
    expect(partyPath("KXMPRT")).toBe("/games/bingo?party=KXMPRT");
  });
});

describe("saved marks", () => {
  it("parses safely", () => {
    expect([...parseMarks("[0,4,24]")]).toEqual([0, 4, 24]);
    expect([...parseMarks("[99,-1,\"x\",3]")]).toEqual([3]);
    expect(parseMarks("not json").size).toBe(0);
    expect(parseMarks(null).size).toBe(0);
  });
});
