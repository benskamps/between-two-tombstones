import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, luminance } from "./contrast";
import { DAY, NIGHT, TEXT_PAIRS, TOKENS, type Token } from "./palette";

const css = readFileSync(fileURLToPath(new URL("../../app/gravitator/gravitator.css", import.meta.url)), "utf8");

/** Every rule block that sets --g-* colors, in file order, as token → value. */
function cssBlocks(): Record<string, string>[] {
  const blocks: Record<string, string>[] = [];
  for (const m of css.matchAll(/\{([^{}]*--g-[^{}]*)\}/g)) {
    const vars = Object.fromEntries([...m[1].matchAll(/--g-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((v) => [v[1], v[2]]));
    if (Object.keys(vars).length > 0) blocks.push(vars);
  }
  return blocks;
}

describe("contrast math", () => {
  it("matches the WCAG reference points", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
  });
});

describe("Gravitator palette", () => {
  it("app/gravitator/gravitator.css carries exactly the palette: night, then daylight twice (OS and toggle)", () => {
    const blocks = cssBlocks();
    expect(blocks).toHaveLength(3);
    const upper = (o: Record<string, string>) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toUpperCase()]));
    expect(upper(blocks[0])).toEqual(upper(NIGHT));
    expect(upper(blocks[1])).toEqual(upper(DAY));
    expect(upper(blocks[2])).toEqual(upper(DAY));
  });

  it("defines every token in both themes", () => {
    for (const t of TOKENS) {
      expect(NIGHT[t]).toMatch(/^#[0-9A-F]{6}$/);
      expect(DAY[t]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("only uses tokens the CSS defines in its text pairs", () => {
    for (const [fg, bg] of TEXT_PAIRS) {
      expect(css).toContain(`--g-${fg}:`);
      expect(css).toContain(`--g-${bg}:`);
    }
  });

  const themes: [string, Record<Token, string>][] = [
    ["night", NIGHT],
    ["daylight", DAY],
  ];
  for (const [theme, p] of themes) {
    for (const [fg, bg, where] of TEXT_PAIRS) {
      it(`${theme}: ${fg} on ${bg} reaches 4.5:1 (${where})`, () => {
        const ratio = contrastRatio(p[fg], p[bg]);
        expect(ratio, `${p[fg]} on ${p[bg]} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
