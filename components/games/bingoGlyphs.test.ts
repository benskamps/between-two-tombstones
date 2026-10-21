import { describe, expect, it } from "vitest";
import { FREE_SQUARE, SYMBOLS } from "@/lib/games/symbols";
import { GLYPHS, REUSED_IDS } from "./bingoGlyphs";

describe("bingo glyphs", () => {
  it("draws every symbol a card can hold, and the free square", () => {
    const drawn = new Set<string>([...Object.keys(GLYPHS), ...REUSED_IDS]);
    for (const s of [...SYMBOLS, FREE_SQUARE]) expect(drawn.has(s.id), s.id).toBe(true);
  });

  it("draws nothing that isn't on a card", () => {
    const ids = new Set([...SYMBOLS, FREE_SQUARE].map((s) => s.id));
    for (const id of [...Object.keys(GLYPHS), ...REUSED_IDS]) expect(ids.has(id), id).toBe(true);
  });

  it("is only line art on the 24-unit grid (no colors, no text)", () => {
    const json = JSON.stringify(GLYPHS);
    expect(json).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(json).not.toMatch(/<text|font/i);
  });
});
