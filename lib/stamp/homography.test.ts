import { describe, expect, it } from "vitest";
import { applySquareToQuad, defaultQuad, isUsableQuad, squareToQuad, warpPerspective, warpedSize } from "./homography";
import type { Quad, RGBAImage } from "./types";

const quad: Quad = [
  { x: 120, y: 80 },
  { x: 610, y: 140 },
  { x: 660, y: 700 },
  { x: 90, y: 620 },
];

describe("square-to-quad homography", () => {
  it("maps the unit square's corners onto the quad", () => {
    const m = squareToQuad(quad);
    const uv: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    uv.forEach(([u, v], i) => {
      const p = applySquareToQuad(m, u, v);
      expect(p.x).toBeCloseTo(quad[i].x, 6);
      expect(p.y).toBeCloseTo(quad[i].y, 6);
    });
  });

  it("is affine (g = h = 0) for a parallelogram", () => {
    const m = squareToQuad([
      { x: 0, y: 0 },
      { x: 10, y: 2 },
      { x: 13, y: 12 },
      { x: 3, y: 10 },
    ]);
    expect(m[6]).toBe(0);
    expect(m[7]).toBe(0);
    expect(applySquareToQuad(m, 0.5, 0.5)).toEqual({ x: 6.5, y: 6 });
  });

  it("keeps straight lines straight (projective, not bilinear)", () => {
    const m = squareToQuad(quad);
    // Points along the square's diagonal must stay collinear after mapping.
    const a = applySquareToQuad(m, 0.1, 0.1);
    const b = applySquareToQuad(m, 0.5, 0.5);
    const c = applySquareToQuad(m, 0.9, 0.9);
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });
});

describe("output size", () => {
  it("takes the aspect from average edge lengths and caps the long side", () => {
    const s = warpedSize(
      [
        { x: 0, y: 0 },
        { x: 2000, y: 0 },
        { x: 2000, y: 1000 },
        { x: 0, y: 1000 },
      ],
      { maxSide: 1000 },
    );
    expect(s).toEqual({ width: 1000, height: 500 });
    expect(warpedSize(quad, { longSide: 1000 }).height).toBe(1000);
  });
});

describe("quad checks", () => {
  it("accepts a clockwise convex quad and rejects crossed or reversed ones", () => {
    expect(isUsableQuad(quad)).toBe(true);
    expect(isUsableQuad([quad[0], quad[2], quad[1], quad[3]])).toBe(false);
    expect(isUsableQuad([quad[3], quad[2], quad[1], quad[0]])).toBe(false);
  });

  it("insets the default frame by 10%", () => {
    expect(defaultQuad(1000, 500)).toEqual([
      { x: 100, y: 50 },
      { x: 899, y: 50 },
      { x: 899, y: 449 },
      { x: 100, y: 449 },
    ]);
  });
});

describe("warpPerspective", () => {
  function gradient(w: number, h: number): RGBAImage {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = (y * w + x) * 4;
        data[j] = x;
        data[j + 1] = y;
        data[j + 2] = 7;
        data[j + 3] = 255;
      }
    return { data, width: w, height: h };
  }

  it("reproduces the source for the full-frame quad", () => {
    const src = gradient(64, 48);
    const full: Quad = [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 48 },
      { x: 0, y: 48 },
    ];
    const out = warpPerspective(src, full, 64, 48);
    expect(Array.from(out.data)).toEqual(Array.from(src.data));
  });

  it("samples bilinearly between pixels", () => {
    const src = gradient(64, 48);
    // Half-pixel shift right: every red value lands halfway between neighbours.
    const shifted: Quad = [
      { x: 10.5, y: 0 },
      { x: 42.5, y: 0 },
      { x: 42.5, y: 48 },
      { x: 10.5, y: 48 },
    ];
    const out = warpPerspective(src, shifted, 32, 48);
    // Samples land at x = 10.5, 11.5, …: halfway between source pixels. Uint8ClampedArray rounds half to even.
    expect(out.data[0]).toBe(10);
    expect(out.data[4]).toBe(12);
    expect(out.data[8]).toBe(12);
    expect(out.data[3]).toBe(255);
  });
});
