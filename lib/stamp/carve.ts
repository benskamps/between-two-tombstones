import { boxMean } from "./integral";
import type { CarveMode, RGBAImage, StampSettings } from "./types";

/**
 * Local-threshold tuning (picked by sweeping the three fixtures in
 * tests/fixtures/stones). A pixel's score is its deviation from the local mean
 * divided by max(local std, STD_FLOOR). The floor keeps flat or finely grained
 * stone from having its noise normalised up into specks. Hysteresis: pixels past
 * Z_WEAK form candidate strokes, and a candidate survives only if some pixel in
 * it passes Z_STRONG, so lichen and grain (weak everywhere) drop out while
 * shallow strokes attached to a deep cut stay whole.
 */
export const Z_WEAK = 0.8;
export const Z_STRONG = 1.6;
export const STD_FLOOR = 0.12;

/** Rec. 601 luma, 0..255. */
export function luminance(img: RGBAImage): Float32Array {
  const { data, width, height } = img;
  const n = width * height;
  const out = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    out[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return out;
}

/** Box radius for a window that is `fraction` of the long side wide. */
export function windowRadius(w: number, h: number, fraction: number): number {
  return Math.max(1, Math.round((Math.max(w, h) * fraction) / 2));
}

/**
 * Flatten uneven light (sun on one side, shade on the other): divide luminance by
 * its box blur over a window one ninth of the long side. The result sits near 1
 * on bare stone; carving shows as dips (shadowed) or bumps (lit).
 */
export function flattenLighting(lum: Float32Array, w: number, h: number): Float32Array {
  const blur = boxMean(lum, w, h, windowRadius(w, h, 1 / 9));
  const out = new Float32Array(lum.length);
  for (let i = 0; i < lum.length; i++) out[i] = lum[i] / (blur[i] + 1);
  return out;
}

/**
 * Local score of the flattened relief: deviation from the local mean (window
 * 1/48 of the long side) over the local std, floored. Negative = darker than
 * its surroundings.
 */
export function localScore(relief: Float32Array, w: number, h: number, floor = STD_FLOOR): Float32Array {
  const n = w * h;
  const mean = new Float32Array(n);
  const std = new Float32Array(n);
  boxMean(relief, w, h, windowRadius(w, h, 1 / 48), mean, std);
  const z = mean; // reuse the buffer
  for (let i = 0; i < n; i++) {
    const s = std[i] > floor ? std[i] : floor;
    z[i] = (relief[i] - mean[i]) / s;
  }
  return z;
}

/** Pixels whose score passes `t` in the mode's direction(s). */
export function thresholdScore(z: Float32Array, mode: CarveMode, t: number): Uint8Array {
  const out = new Uint8Array(z.length);
  for (let i = 0; i < z.length; i++) {
    const d = z[i];
    if (mode === "dark") out[i] = d < -t ? 1 : 0;
    else if (mode === "light") out[i] = d > t ? 1 : 0;
    else out[i] = d < -t || d > t ? 1 : 0;
  }
  return out;
}

/** Single-threshold version of the local threshold (kept for tests and tuning). */
export function localThreshold(
  relief: Float32Array,
  w: number,
  h: number,
  mode: CarveMode,
  z = Z_WEAK,
  floor = STD_FLOOR,
): Uint8Array {
  return thresholdScore(localScore(relief, w, h, floor), mode, z);
}

/** Separable square max (dilate) or min (erode) filter, window 2r+1, clamped at the borders. */
function morph(mask: Uint8Array, w: number, h: number, r: number, dilateMode: boolean): Uint8Array {
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  const hit = dilateMode ? 1 : 0;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const x0 = x - r < 0 ? 0 : x - r;
      const x1 = x + r >= w ? w - 1 : x + r;
      let v = 1 - hit;
      for (let k = x0; k <= x1; k++) {
        if (mask[o + k] === hit) {
          v = hit;
          break;
        }
      }
      tmp[o + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = y - r < 0 ? 0 : y - r;
    const y1 = y + r >= h ? h - 1 : y + r;
    for (let x = 0; x < w; x++) {
      let v = 1 - hit;
      for (let k = y0; k <= y1; k++) {
        if (tmp[k * w + x] === hit) {
          v = hit;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export const dilate = (mask: Uint8Array, w: number, h: number, r = 1) => morph(mask, w, h, r, true);
export const erode = (mask: Uint8Array, w: number, h: number, r = 1) => morph(mask, w, h, r, false);
/** Morphological close with a 3×3 square: bridges hairline gaps inside strokes. */
export const close3 = (mask: Uint8Array, w: number, h: number) => erode(dilate(mask, w, h, 1), w, h, 1);

export type Components = {
  /** Per-pixel component id, 0 = background, 1..count. */
  labels: Int32Array;
  count: number;
  /** Indexed by component id. */
  area: Int32Array;
  touchesEdge: Uint8Array;
};

/** Two-pass 8-connected labeling with union-find (path halving, smaller root wins). */
export function labelComponents(mask: Uint8Array, w: number, h: number): Components {
  const n = w * h;
  const labels = new Int32Array(n);
  // A new provisional label needs its W, NW, N and NE neighbors empty, so there are at most ~n/4 + w.
  const parent = new Int32Array((n >> 2) + w + 2);
  let next = 1;
  const find = (x: number) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a === b) return a;
    if (a < b) {
      parent[b] = a;
      return a;
    }
    parent[a] = b;
    return b;
  };

  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const i = o + x;
      if (!mask[i]) continue;
      let l = 0;
      if (x > 0 && labels[i - 1]) l = labels[i - 1];
      if (y > 0) {
        const up = i - w;
        if (x > 0 && labels[up - 1]) l = l ? union(l, labels[up - 1]) : labels[up - 1];
        if (labels[up]) l = l ? union(l, labels[up]) : labels[up];
        if (x < w - 1 && labels[up + 1]) l = l ? union(l, labels[up + 1]) : labels[up + 1];
      }
      if (!l) {
        parent[next] = next;
        l = next++;
      }
      labels[i] = l;
    }
  }

  // parent[l] <= l always, so one forward sweep resolves every label to its root.
  const compact = new Int32Array(next);
  let count = 0;
  for (let l = 1; l < next; l++) {
    parent[l] = parent[parent[l]];
    if (parent[l] === l) compact[l] = ++count;
  }
  const area = new Int32Array(count + 1);
  const touchesEdge = new Uint8Array(count + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    const edgeRow = y === 0 || y === h - 1;
    for (let x = 0; x < w; x++) {
      const i = o + x;
      if (!labels[i]) continue;
      const c = compact[parent[labels[i]]];
      labels[i] = c;
      area[c]++;
      if (edgeRow || x === 0 || x === w - 1) touchesEdge[c] = 1;
    }
  }
  return { labels, count, area, touchesEdge };
}

export type FilterStats = {
  components: number;
  kept: number;
  droppedSmall: number;
  droppedEdge: number;
  /** Components with no strong (seed) pixel, when seeds are given. */
  droppedWeak: number;
};

/**
 * Keep components that are at least `minArea` pixels, don't touch the frame
 * edge (that removes the stone's outline, grass and background), and, when
 * `seeds` is given, contain at least one seed pixel.
 */
export function filterComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
  seeds?: Uint8Array,
): { mask: Uint8Array; stats: FilterStats } {
  const { labels, count, area, touchesEdge } = labelComponents(mask, w, h);
  let seeded: Uint8Array | null = null;
  if (seeds) {
    seeded = new Uint8Array(count + 1);
    for (let i = 0; i < labels.length; i++) if (seeds[i] && labels[i]) seeded[labels[i]] = 1;
  }
  const keep = new Uint8Array(count + 1);
  let kept = 0;
  let droppedSmall = 0;
  let droppedEdge = 0;
  let droppedWeak = 0;
  for (let c = 1; c <= count; c++) {
    if (touchesEdge[c]) droppedEdge++;
    else if (area[c] < minArea) droppedSmall++;
    else if (seeded && !seeded[c]) droppedWeak++;
    else {
      keep[c] = 1;
      kept++;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = keep[labels[i]];
  return { mask: out, stats: { components: count, kept, droppedSmall, droppedEdge, droppedWeak } };
}

/** Grit slider value (px at a 1000 px image) → minimum component area at this size. */
export function gritToArea(grit: number, w: number, h: number): number {
  const s = Math.max(w, h) / 1000;
  return Math.round(grit * s * s);
}

export function strokeWeight(mask: Uint8Array, w: number, h: number, stroke: number): Uint8Array {
  const r = Math.max(-3, Math.min(3, Math.round(stroke)));
  if (r > 0) return dilate(mask, w, h, r);
  if (r < 0) return erode(mask, w, h, -r);
  return mask;
}

export type CarveStats = FilterStats & { rawPixels: number; maskPixels: number };

export function countOn(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) c += mask[i];
  return c;
}

/**
 * Stage 1 (depends only on the straightened image): luminance, and the
 * flattened relief with a 3×3 box denoise (per 1000 px) so single-pixel grain
 * doesn't become specks.
 */
export function prepareRelief(img: RGBAImage): { lum: Float32Array; relief: Float32Array } {
  const { width: w, height: h } = img;
  const lum = luminance(img);
  const flat = flattenLighting(lum, w, h);
  const r = Math.max(1, Math.round(Math.max(w, h) / 1000));
  return { lum, relief: boxMean(flat, w, h, r) };
}

/**
 * Stage 2: local threshold (weak) → morphological close → connected components,
 * dropping specks under the grit size, blobs touching the frame edge and
 * components without a strong pixel → stroke weight.
 */
export function carveMask(
  relief: Float32Array,
  w: number,
  h: number,
  settings: StampSettings,
): { mask: Uint8Array; stats: CarveStats } {
  const z = localScore(relief, w, h);
  const weak = thresholdScore(z, settings.mode, Z_WEAK);
  const strong = thresholdScore(z, settings.mode, Z_STRONG);
  const closed = close3(weak, w, h);
  const { mask: filtered, stats } = filterComponents(closed, w, h, gritToArea(settings.grit, w, h), strong);
  const mask = strokeWeight(filtered, w, h, settings.stroke);
  return { mask, stats: { ...stats, rawPixels: countOn(weak), maskPixels: countOn(mask) } };
}

/** The whole lift in one call (used by tests). */
export function liftCarving(img: RGBAImage, settings: StampSettings) {
  const { lum, relief } = prepareRelief(img);
  const { mask, stats } = carveMask(relief, img.width, img.height, settings);
  return { lum, relief, mask, stats, width: img.width, height: img.height };
}
