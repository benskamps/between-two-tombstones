import { describe, expect, it } from "vitest";
import { fitRect, kitLayout, perforationCentres, rotatedBounds } from "./layout";
import { valueNoise } from "./noise";
import {
  PAPER,
  WAX,
  contrastBoost,
  distressInk,
  engrave,
  inkedFraction,
  maskToInk,
  paperTexture,
  percentile,
  renderRubbing,
} from "./render";

const w = 120;
const h = 80;
const flat = new Float32Array(w * h).fill(1);
const mask = new Uint8Array(w * h);
for (let y = 30; y < 50; y++) for (let x = 40; x < 80; x++) mask[y * w + x] = 1;

const lum = (d: Uint8ClampedArray, j: number) => 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];

describe("noise", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = valueNoise(50, 40, 7, 1);
    expect(Array.from(a)).toEqual(Array.from(valueNoise(50, 40, 7, 1)));
    expect(Array.from(a)).not.toEqual(Array.from(valueNoise(50, 40, 7, 2)));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThan(1);
  });
});

describe("rubbing", () => {
  const rub = renderRubbing(flat, mask, w, h);
  const pad = (rub.width - w) / 2;
  const px = (x: number, y: number) => ((y + pad) * rub.width + x + pad) * 4;

  it("adds a paper margin and is opaque", () => {
    expect(rub.width).toBeGreaterThan(w);
    expect(rub.height - h).toBe(rub.width - w);
    for (let j = 3; j < rub.data.length; j += 4) expect(rub.data[j]).toBe(255);
  });

  it("lays dark wax over the face and leaves the carving paper-white", () => {
    const face = lum(rub.data, px(20, 40));
    const carved = lum(rub.data, px(60, 40));
    const paper = lum(rub.data, 0);
    expect(face).toBeLessThan(110);
    expect(carved).toBeGreaterThan(200);
    expect(Math.abs(paper - lum(Uint8ClampedArray.from([...PAPER, 255]), 0))).toBeLessThan(25);
    expect(face).toBeGreaterThan(lum(Uint8ClampedArray.from([...WAX, 255]), 0) - 1);
  });

  it("fades the wax out toward the edge of the face", () => {
    expect(lum(rub.data, px(0, 40))).toBeGreaterThan(lum(rub.data, px(20, 40)) + 40);
  });
});

describe("ink stamp layer", () => {
  it("is transparent off the carving and distress knocks some ink out", () => {
    const big = new Uint8Array(400 * 300).fill(0);
    for (let y = 50; y < 250; y++) for (let x = 50; x < 350; x++) big[y * 400 + x] = 1;
    const ink = maskToInk(big, 400, 300);
    expect(ink.data[3]).toBe(0);
    const before = ink.data.filter((_, j) => j % 4 === 3 && ink.data[j] === 255).length;
    distressInk(ink, 3);
    const after = ink.data.filter((_, j) => j % 4 === 3 && ink.data[j] === 255).length;
    expect(after).toBeLessThan(before * 0.9);
    expect(after).toBeGreaterThan(0);
    expect(ink.data[3]).toBe(0);
  });
});

describe("engraving", () => {
  it("lines get thicker where the image is darker", () => {
    const bright = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bright[y * w + x] = x < w / 2 ? 0.15 : 0.9;
    const img = engrave(bright, w, h, { period: 6, angle: 0 });
    let darkSide = 0;
    let lightSide = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = lum(img.data, (y * w + x) * 4);
        if (x < w / 2) darkSide += v;
        else lightSide += v;
      }
    expect(darkSide).toBeLessThan(lightSide * 0.7);
    expect(inkedFraction(img)).toBeGreaterThan(0.1);
  });

  it("contrast boost spans 0..1", () => {
    const l = new Float32Array(w * h).map((_, i) => 100 + (i % w));
    const b = contrastBoost(l, flat);
    expect(percentile(b, 0.01)).toBeLessThan(0.05);
    expect(percentile(b, 0.99)).toBeGreaterThan(0.95);
  });
});

describe("blank check", () => {
  it("calls a flat paper image blank-ish and a rubbing not", () => {
    const blank = { data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h };
    expect(inkedFraction(blank)).toBe(0);
    expect(inkedFraction(paperTexture(w, h, 1))).toBeLessThan(0.05);
    expect(inkedFraction(renderRubbing(flat, mask, w, h))).toBeGreaterThan(0.3);
  });
});

describe("layout", () => {
  it("fits renders inside their boxes without distortion", () => {
    const r = fitRect({ width: 200, height: 100 }, { x: 10, y: 10, w: 100, h: 100 });
    expect(r).toEqual({ x: 10, y: 35, w: 100, h: 50 });
  });

  it("keeps every kit box on the canvas", () => {
    for (const kind of ["sheet", "story"] as const) {
      const L = kitLayout(kind);
      expect(L.size).toEqual(kind === "sheet" ? { width: 1080, height: 1350 } : { width: 1080, height: 1920 });
      for (const b of [L.title, L.rubbing, L.ink, L.postage, L.footer]) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(L.size.width);
        expect(b.y + b.h).toBeLessThanOrEqual(L.size.height);
      }
    }
  });

  it("sizes the −2° rotation and spaces perforations evenly", () => {
    const r = rotatedBounds(1000, 500, -2);
    expect(r.width).toBeGreaterThan(1000);
    expect(r.height).toBeGreaterThan(500);
    const p = perforationCentres(260, 130, 10);
    expect(p.filter((c) => c.y === 0).length).toBe(p.filter((c) => c.y === 130).length);
    expect(p.every((c) => c.x === 0 || c.x === 260 || c.y === 0 || c.y === 130)).toBe(true);
  });
});
