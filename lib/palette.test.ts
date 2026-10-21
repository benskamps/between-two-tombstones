import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, luminance } from "./contrast";
import { CSS_VAR, MIXED, PALETTE, TEXT_PAIRS, TOKENS, UI_PAIRS, colorOf, mixHex } from "./palette";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const globals = read("../app/globals.css");
const gravitator = read("../app/gravitator/gravitator.css");
const manifest = read("../app/manifest.ts");
const layout = read("../app/layout.tsx");
const sw = read("../public/sw.js");

/** The first :root { … } block in globals.css, as property → value. */
function rootVars(): Record<string, string> {
  const m = globals.match(/:root\s*\{([^}]*)\}/);
  expect(m, ":root block in app/globals.css").not.toBeNull();
  return Object.fromEntries([...m![1].matchAll(/((?:--)?[a-z][a-z0-9-]*):\s*([^;]+);/g)].map((v) => [v[1], v[2].trim()]));
}

describe("contrast math", () => {
  it("matches the WCAG reference points", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
  });

  it("mixes like color-mix(in srgb)", () => {
    expect(mixHex("#000000", "#FFFFFF", 50)).toBe("#808080");
    expect(mixHex("#C7A2DC", "#130F15", 100)).toBe("#C7A2DC");
    expect(mixHex("#C7A2DC", "#130F15", 0)).toBe("#130F15");
  });
});

describe("palette", () => {
  it("defines every token as #RRGGBB", () => {
    for (const t of TOKENS) expect(PALETTE[t], t).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("app/globals.css :root carries exactly these values, dark only", () => {
    const vars = rootVars();
    for (const t of TOKENS) expect(vars[CSS_VAR[t]]?.toUpperCase(), `${CSS_VAR[t]} (${t})`).toBe(PALETTE[t]);
    expect(vars["color-scheme"]).toBe("dark");
    expect(globals).not.toMatch(/prefers-color-scheme/);
    expect(globals).not.toMatch(/data-theme/);
  });

  it("the hex values live only in the :root block of globals.css", () => {
    const outsideRoot = globals.replace(/:root\s*\{[^}]*\}/, "");
    const stray = [...outsideRoot.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
    expect(stray).toEqual([]);
  });

  it("app/gravitator/gravitator.css aliases the globals instead of repeating values", () => {
    expect(gravitator).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(gravitator).not.toMatch(/prefers-color-scheme/);
    expect(gravitator).not.toMatch(/data-theme/);
    const aliases: Record<string, string> = {
      bg: "bg",
      surface: "surface",
      "surface-2": "surface-2",
      border: "border",
      text: "text",
      muted: "muted",
      mauve: "mauve",
      "mauve-ink": "mauve-ink",
      candle: "candle",
      lichen: "lichen",
      ash: "ash",
      wisp: "wisp",
    };
    for (const [g, token] of Object.entries(aliases)) {
      const cssVar = CSS_VAR[token as keyof typeof CSS_VAR];
      expect(gravitator, `--g-${g}`).toMatch(new RegExp(`--g-${g}:\\s*var\\(${cssVar}\\);`));
    }
  });

  it("the service worker's offline page (no CSS variables there) uses palette values only", () => {
    const used = [...sw.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase());
    expect(used.length).toBeGreaterThan(0);
    const values = new Set(Object.values(PALETTE));
    for (const hex of used) expect(values.has(hex), hex).toBe(true);
  });

  it("the manifest and the viewport theme color are the page background", () => {
    expect(manifest).toMatch(/background_color:\s*PALETTE\.bg/);
    expect(manifest).toMatch(/theme_color:\s*PALETTE\.bg/);
    expect(layout).toMatch(/themeColor:\s*PALETTE\.bg/);
    expect(layout).toMatch(/colorScheme:\s*"dark"/);
  });

  it("only pairs colors the CSS defines", () => {
    for (const [fg, bg] of [...TEXT_PAIRS, ...UI_PAIRS]) {
      for (const name of [fg, bg]) {
        if (name in MIXED) continue;
        expect(globals, name).toContain(`${CSS_VAR[name as keyof typeof CSS_VAR]}:`);
      }
    }
    // Mixed surfaces are mixed in the CSS the same way the test mixes them.
    for (const m of Object.values(MIXED)) {
      expect(globals).toContain(`color-mix(in srgb, var(${CSS_VAR[m.a]}) ${m.p}%, var(${CSS_VAR[m.b]}))`);
    }
  });

  for (const [fg, bg, where] of TEXT_PAIRS) {
    it(`text: ${fg} on ${bg} reaches 4.5:1 (${where})`, () => {
      const ratio = contrastRatio(colorOf(fg), colorOf(bg));
      expect(ratio, `${colorOf(fg)} on ${colorOf(bg)} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const [fg, bg, where] of UI_PAIRS) {
    it(`boundary: ${fg} against ${bg} reaches 3:1 (${where})`, () => {
      const ratio = contrastRatio(colorOf(fg), colorOf(bg));
      expect(ratio, `${colorOf(fg)} vs ${colorOf(bg)} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    });
  }

  it("covers every token: each is text, a surface, or a boundary in some pair", () => {
    const used = new Set([...TEXT_PAIRS, ...UI_PAIRS].flatMap(([a, b]) => [a, b]));
    // border is decorative only (documented on UI_PAIRS); everything else must be checked.
    for (const t of TOKENS.filter((t) => t !== "border")) expect(used.has(t), t).toBe(true);
  });
});
