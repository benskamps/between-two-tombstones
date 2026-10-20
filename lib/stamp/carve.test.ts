import { describe, expect, it } from "vitest";
import {
  close3,
  countOn,
  dilate,
  erode,
  filterComponents,
  gritToArea,
  labelComponents,
  liftCarving,
  localThreshold,
  strokeWeight,
} from "./carve";
import { boxMean } from "./integral";
import { hash2 } from "./noise";
import type { RGBAImage } from "./types";

/** Reference 8-connected component count by flood fill. */
function floodCount(mask: Uint8Array, w: number, h: number): number {
  const seen = new Uint8Array(mask.length);
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    n++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
    }
  }
  return n;
}

function randomMask(w: number, h: number, density: number, seed: number) {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = hash2(i % w, Math.floor(i / w), seed) < density ? 1 : 0;
  return m;
}

describe("box mean via integral image", () => {
  it("matches a brute-force window mean, clamped at the edges", () => {
    const w = 23;
    const h = 17;
    const src = new Float32Array(w * h).map((_, i) => hash2(i, 3, 9) * 100);
    const std = new Float32Array(w * h);
    const fast = boxMean(src, w, h, 3, undefined, std);
    for (const [x, y] of [
      [0, 0],
      [5, 9],
      [22, 16],
      [11, 0],
    ]) {
      let s = 0;
      let s2 = 0;
      let n = 0;
      for (let yy = Math.max(0, y - 3); yy <= Math.min(h - 1, y + 3); yy++)
        for (let xx = Math.max(0, x - 3); xx <= Math.min(w - 1, x + 3); xx++) {
          s += src[yy * w + xx];
          s2 += src[yy * w + xx] ** 2;
          n++;
        }
      expect(fast[y * w + x]).toBeCloseTo(s / n, 3);
      expect(std[y * w + x]).toBeCloseTo(Math.sqrt(s2 / n - (s / n) ** 2), 2);
    }
  });
});

describe("union-find labeling", () => {
  it("agrees with a flood fill on random masks", () => {
    for (const [density, seed] of [
      [0.3, 1],
      [0.5, 2],
      [0.62, 3],
    ]) {
      const w = 97;
      const h = 61;
      const m = randomMask(w, h, density, seed);
      const { count, area } = labelComponents(m, w, h);
      expect(count).toBe(floodCount(m, w, h));
      expect(area.reduce((a, b) => a + b, 0)).toBe(countOn(m));
    }
  });

  it("joins a U shape that the first pass labels twice", () => {
    const w = 5;
    const h = 3;
    // prettier-ignore
    const m = Uint8Array.from([
      1, 0, 0, 0, 1,
      1, 0, 0, 0, 1,
      1, 1, 1, 1, 1,
    ]);
    expect(labelComponents(m, w, h).count).toBe(1);
  });
});

describe("component filter", () => {
  // 12×10: a blob touching the left edge, a 2-px speck, a 9-px block inside.
  const w = 12;
  const h = 10;
  const m = new Uint8Array(w * h);
  const set = (x: number, y: number) => (m[y * w + x] = 1);
  for (let y = 2; y < 6; y++) {
    set(0, y);
    set(1, y);
  }
  set(5, 1);
  set(6, 1);
  for (let y = 5; y < 8; y++) for (let x = 6; x < 9; x++) set(x, y);

  it("drops edge-touching blobs and specks below the grit size", () => {
    const { mask, stats } = filterComponents(m, w, h, 3);
    expect(stats).toMatchObject({ components: 3, kept: 1, droppedEdge: 1, droppedSmall: 1 });
    expect(countOn(mask)).toBe(9);
    expect(mask[0 * w + 2 * w]).toBe(0);
  });

  it("keeps only seeded components when seeds are given", () => {
    const seeds = new Uint8Array(w * h);
    expect(filterComponents(m, w, h, 1, seeds).stats.kept).toBe(0);
    seeds[6 * w + 7] = 1;
    expect(filterComponents(m, w, h, 1, seeds).stats.kept).toBe(1);
  });

  it("scales grit by image area", () => {
    expect(gritToArea(40, 1000, 800)).toBe(40);
    expect(gritToArea(40, 2000, 800)).toBe(160);
    expect(gritToArea(40, 500, 400)).toBe(10);
  });
});

describe("morphology", () => {
  const w = 9;
  const h = 9;
  const dot = new Uint8Array(w * h);
  dot[4 * w + 4] = 1;

  it("dilates and erodes with a square window", () => {
    expect(countOn(dilate(dot, w, h, 1))).toBe(9);
    expect(countOn(dilate(dot, w, h, 2))).toBe(25);
    expect(countOn(erode(dilate(dot, w, h, 2), w, h, 1))).toBe(9);
  });

  it("close bridges a one-pixel gap", () => {
    const m = new Uint8Array(w * h);
    for (let x = 1; x < 8; x++) if (x !== 4) m[4 * w + x] = 1;
    expect(m[4 * w + 4]).toBe(0);
    expect(close3(m, w, h)[4 * w + 4]).toBe(1);
  });

  it("stroke weight dilates for + and erodes for −, capped at 3", () => {
    const block = dilate(dot, w, h, 3);
    expect(countOn(strokeWeight(block, w, h, -1))).toBe(25);
    expect(countOn(strokeWeight(dot, w, h, 1))).toBe(9);
    expect(countOn(strokeWeight(dot, w, h, 9))).toBe(49);
    expect(strokeWeight(dot, w, h, 0)).toBe(dot);
  });
});

describe("carving lift", () => {
  /**
   * A 960×600 stone face (about the size the worker works at) with a lighting
   * gradient and grain, a dark carved bar, a light bar, and grass along the
   * frame edge.
   */
  const W = 960;
  const H = 600;
  function stone(): RGBAImage {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let v = 120 + (x / W) * 60 + (hash2(x, y, 4) - 0.5) * 8;
        if (y >= 295 && y < 305 && x >= 150 && x < 400) v -= 60; // carved, in shadow (about −45%)
        if (y >= 295 && y < 305 && x >= 560 && x < 810) v += 65; // lit edge (about +40%)
        // Grass and shadow at the frame edge.
        if (x < 16 || y < 16 || x >= W - 16 || y >= H - 16) v = hash2(x >> 2, y >> 2, 8) < 0.5 ? 40 : 190;
        const j = (y * W + x) * 4;
        data[j] = data[j + 1] = data[j + 2] = v;
        data[j + 3] = 255;
      }
    return { data, width: W, height: H };
  }
  const img = stone();
  const at = (mask: Uint8Array, x: number, y: number) => mask[y * W + x];

  it("finds the dark bar in dark mode, the light bar in light mode, both in edges mode", () => {
    const dark = liftCarving(img, { mode: "dark", grit: 10, stroke: 0 });
    expect(at(dark.mask, 275, 300)).toBe(1);
    expect(at(dark.mask, 685, 300)).toBe(0);
    const light = liftCarving(img, { mode: "light", grit: 10, stroke: 0 });
    expect(at(light.mask, 685, 300)).toBe(1);
    expect(at(light.mask, 275, 300)).toBe(0);
    const edges = liftCarving(img, { mode: "edges", grit: 10, stroke: 0 });
    expect(at(edges.mask, 275, 300)).toBe(1);
    expect(at(edges.mask, 685, 300)).toBe(1);
  });

  it("ignores grainy bare stone (std floor + hysteresis) and drops grass touching the frame edge", () => {
    const { mask, stats } = liftCarving(img, { mode: "dark", grit: 10, stroke: 0 });
    expect(at(mask, 480, 450)).toBe(0);
    expect(stats.droppedEdge).toBeGreaterThan(50);
    let edge = 0;
    for (let x = 0; x < W; x++) edge += at(mask, x, 0) + at(mask, x, H - 1);
    for (let y = 0; y < H; y++) edge += at(mask, 0, y) + at(mask, W - 1, y);
    expect(edge).toBe(0);
    // Away from the grass band, only the bar survives: 250×10 px, give or take its softened ends.
    let inner = 0;
    for (let y = 40; y < H - 40; y++) for (let x = 40; x < W - 40; x++) inner += at(mask, x, y);
    expect(inner).toBeGreaterThan(2000);
    expect(inner).toBeLessThan(3500);
  });

  it("a near-zero std floor lets grain through", () => {
    const { relief } = liftCarving(img, { mode: "dark", grit: 0, stroke: 0 });
    expect(countOn(localThreshold(relief, W, H, "dark", 0.8, 0.0001))).toBeGreaterThan(
      2 * countOn(localThreshold(relief, W, H, "dark", 0.8)),
    );
  });
});
