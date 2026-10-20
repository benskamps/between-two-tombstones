// Pixel-level parts of the three renders. Text, frames, rotation and
// perforations are drawn with canvas in the worker; everything per-pixel lives
// here so it can be tested without a browser.

import { boxMean } from "./integral";
import { smoothstep, valueNoise, whiteNoise } from "./noise";
import type { RGBAImage } from "./types";

export type RGB = [number, number, number];

export const PAPER: RGB = [238, 230, 211];
export const WAX: RGB = [31, 27, 30];
export const INK: RGB = [146, 30, 34];
export const ENGRAVING: RGB = [28, 56, 84];
export const STAMP_PAPER: RGB = [250, 246, 236];

/** Soft 0..1 coverage of a binary mask (3×3 box), for anti-aliased edges. */
export function softMask(mask: Uint8Array, w: number, h: number): Float32Array {
  const f = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) f[i] = mask[i];
  return boxMean(f, w, h, 1);
}

/** Procedural paper: warm off-white with low mottling, mid grain and fine fibre speckle. */
export function paperTexture(w: number, h: number, seed: number, base: RGB = PAPER): RGBAImage {
  const side = Math.max(w, h);
  const mottle = valueNoise(w, h, side / 7, seed);
  const grain = valueNoise(w, h, 3, seed + 1);
  const fibre = whiteNoise(w, h, seed + 2);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const d = (mottle[i] - 0.5) * 14 + (grain[i] - 0.5) * 10 + (fibre[i] - 0.5) * 7;
    data[j] = base[0] + d;
    data[j + 1] = base[1] + d;
    data[j + 2] = base[2] + d * 1.15;
    data[j + 3] = 255;
  }
  return { data, width: w, height: h };
}

/**
 * Rubbing: paper with a margin, dark wax laid over the stone face. The wax
 * density follows the stone's own flattened relief (grain and pits pick up less
 * wax), streaks like a crayon pushed sideways, fades out at an irregular soft
 * edge, and leaves the carving paper-white.
 */
export function renderRubbing(
  relief: Float32Array,
  mask: Uint8Array,
  w: number,
  h: number,
  seed = 7,
): RGBAImage {
  const side = Math.max(w, h);
  const pad = Math.round(side * 0.06);
  const W = w + pad * 2;
  const H = h + pad * 2;
  const paper = paperTexture(W, H, seed);
  const edgeLow = valueNoise(W, H, side / 12, seed + 10);
  const edgeMid = valueNoise(W, H, side / 45, seed + 11);
  const streak = valueNoise(W, H, side / 9, seed + 12, 4);
  const speck = valueNoise(W, H, 1.7, seed + 13);
  const soft = softMask(mask, w, h);
  const amp = side * 0.05;
  const fadeW = side * 0.07;
  const out = paper.data;
  for (let fy = 0; fy < h; fy++) {
    const y = fy + pad;
    for (let fx = 0; fx < w; fx++) {
      const x = fx + pad;
      const i = y * W + x;
      // Distance in from the face's edge; the jitter makes the margin ragged, always inside the face.
      const dist = Math.min(fx, fy, w - 1 - fx, h - 1 - fy);
      const jitter = (edgeLow[i] - 0.5) * amp + (edgeMid[i] - 0.5) * amp * 0.35;
      const fade = smoothstep(0, fadeW, dist + jitter);
      if (fade <= 0) continue;
      const fi = fy * w + fx;
      const r = relief[fi];
      let t = 0.74 + (r - 1) * 1.9 + (streak[i] - 0.5) * 0.2 - (speck[i] > 0.82 ? 0.25 : 0);
      t = t < 0.12 ? 0.12 : t > 1 ? 1 : t;
      const a = 0.93 * fade * t * (1 - 0.95 * soft[fi]);
      const j = i * 4;
      out[j] = out[j] * (1 - a) + WAX[0] * a;
      out[j + 1] = out[j + 1] * (1 - a) + WAX[1] * a;
      out[j + 2] = out[j + 2] * (1 - a) + WAX[2] * a;
    }
  }
  return paper;
}

/** The carving mask in ink on a transparent background. */
export function maskToInk(mask: Uint8Array, w: number, h: number, color: RGB = INK): RGBAImage {
  const soft = softMask(mask, w, h);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    data[j] = color[0];
    data[j + 1] = color[1];
    data[j + 2] = color[2];
    data[j + 3] = soft[i] * 255;
  }
  return { data, width: w, height: h };
}

/**
 * Rubber-stamp distress, in place on an RGBA buffer: three octaves of noise
 * knock ink out unevenly. Low = uneven pressure (fades whole areas), mid =
 * small voids, fine = speckle.
 */
export function distressInk(img: RGBAImage, seed = 3): void {
  const { data, width: w, height: h } = img;
  const side = Math.max(w, h);
  const low = valueNoise(w, h, side / 5, seed);
  const mid = valueNoise(w, h, side / 42, seed + 1);
  const fine = valueNoise(w, h, 1.6, seed + 2);
  for (let i = 0, j = 3; i < w * h; i++, j += 4) {
    if (data[j] === 0) continue;
    const pressure = 0.6 + 0.4 * smoothstep(0.12, 0.62, low[i]);
    const voids = smoothstep(0.75, 0.82, mid[i]);
    const speckle = smoothstep(0.78, 0.92, fine[i]);
    data[j] = data[j] * pressure * (1 - voids) * (1 - 0.8 * speckle);
  }
}

/** Value at percentile p (0..1) of `values`, via a 1024-bin histogram. */
export function percentile(values: Float32Array, p: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(hi > lo)) return lo;
  const bins = new Uint32Array(1024);
  const scale = 1023 / (hi - lo);
  for (let i = 0; i < values.length; i++) bins[((values[i] - lo) * scale) | 0]++;
  const target = p * values.length;
  let acc = 0;
  for (let b = 0; b < 1024; b++) {
    acc += bins[b];
    if (acc >= target) return lo + b / scale;
  }
  return hi;
}

/** Stretch so the 1st..99th percentile spans 0..1 (clamped). */
export function stretch(values: Float32Array, pLo = 0.01, pHi = 0.99): Float32Array {
  const lo = percentile(values, pLo);
  const hi = percentile(values, pHi);
  const out = new Float32Array(values.length);
  const k = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < values.length; i++) {
    const v = (values[i] - lo) * k;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}

/**
 * Contrast-boosted brightness (0..1): half global tone, half flattened relief,
 * stretched. Keeps the photo recognisable while lifting the carving.
 */
export function contrastBoost(lum: Float32Array, relief: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < lum.length; i++) mean += lum[i];
  mean = mean / lum.length || 1;
  const mix = new Float32Array(lum.length);
  for (let i = 0; i < lum.length; i++) mix[i] = 0.45 * (lum[i] / mean) + 0.55 * relief[i];
  return stretch(mix, 0.02, 0.98);
}

/** Gray RGBA from 0..1 values (for the image sent to the reader). */
export function grayToRGBA(values: Float32Array, w: number, h: number): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const v = values[i] * 255;
    data[j] = v;
    data[j + 1] = v;
    data[j + 2] = v;
    data[j + 3] = 255;
  }
  return { data, width: w, height: h };
}

/**
 * Engraved-line screen: parallel lines (angle in degrees, 0 = horizontal) every
 * `period` px whose thickness follows darkness, with a slow wobble like a
 * hand-cut plate. `brightness` is 0..1; the carving mask, when given, is pushed
 * darker so the letters read.
 */
export function engrave(
  brightness: Float32Array,
  w: number,
  h: number,
  opts: { period?: number; angle?: number; mask?: Uint8Array; seed?: number; ink?: RGB; paper?: RGB } = {},
): RGBAImage {
  const side = Math.max(w, h);
  const period = opts.period ?? Math.max(4, Math.round(side / 140));
  const angle = ((opts.angle ?? 45) * Math.PI) / 180;
  const ink = opts.ink ?? ENGRAVING;
  const paper = opts.paper ?? STAMP_PAPER;
  const ca = Math.cos(angle) / period;
  const sa = Math.sin(angle) / period;
  const wobble = valueNoise(w, h, side / 6, opts.seed ?? 5);
  const soft = opts.mask ? softMask(opts.mask, w, h) : null;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let b = brightness[i];
      if (soft) b *= 1 - 0.55 * soft[i];
      const dark = 1 - b;
      const t = -x * sa + y * ca + (wobble[i] - 0.5) * 0.9;
      const frac = t - Math.floor(t);
      const distPx = Math.abs(frac - 0.5) * period;
      const half = (dark * period) / 2;
      let c = half - distPx + 0.5;
      c = c < 0 ? 0 : c > 1 ? 1 : c;
      const j = i * 4;
      data[j] = paper[0] + (ink[0] - paper[0]) * c;
      data[j + 1] = paper[1] + (ink[1] - paper[1]) * c;
      data[j + 2] = paper[2] + (ink[2] - paper[2]) * c;
      data[j + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/**
 * Blankness check: the fraction of pixels whose luminance or alpha is far
 * (> 48 levels) from the image's median. Paper grain stays under that; ink,
 * wax and engraved lines don't.
 */
export function inkedFraction(img: RGBAImage): number {
  const { data } = img;
  const n = data.length / 4;
  const lumHist = new Uint32Array(256);
  const alphaHist = new Uint32Array(256);
  const lum = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const l = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0;
    lum[i] = l;
    lumHist[l]++;
    alphaHist[data[j + 3]]++;
  }
  const median = (hist: Uint32Array) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc * 2 >= n) return v;
    }
    return 255;
  };
  const ml = median(lumHist);
  const ma = median(alphaHist);
  let count = 0;
  for (let i = 0, j = 3; i < n; i++, j += 4) {
    const a = data[j];
    if (Math.abs(a - ma) > 48 || (a > 0 && Math.abs(lum[i] - ml) > 48)) count++;
  }
  return count / n;
}
