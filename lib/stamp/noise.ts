// Seeded value noise. Deterministic for a given seed so renders (and tests) are repeatable.

/** Integer hash of a lattice point → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth value noise on a lattice with `cell` px spacing (or `cell`×`cellY` for
 * streaks), filled for a w×h image, values in [0, 1). Lattice values are hashed
 * once; each pixel then costs one smoothstep-weighted bilinear blend.
 */
export function valueNoise(w: number, h: number, cell: number, seed: number, cellY = cell): Float32Array {
  const c = Math.max(1, cell);
  const cy = Math.max(1, cellY);
  const gw = Math.ceil(w / c) + 2;
  const gh = Math.ceil(h / cy) + 2;
  const lattice = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) lattice[gy * gw + gx] = hash2(gx, gy, seed);
  // Precompute per-column cell index and eased fraction.
  const colIdx = new Int32Array(w);
  const colT = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = x / c;
    const ix = Math.floor(fx);
    const t = fx - ix;
    colIdx[x] = ix;
    colT[x] = t * t * (3 - 2 * t);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cy;
    const iy = Math.floor(fy);
    let ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    const r0 = iy * gw;
    const r1 = r0 + gw;
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const ix = colIdx[x];
      const tx = colT[x];
      const a = lattice[r0 + ix];
      const b = lattice[r0 + ix + 1];
      const d = lattice[r1 + ix];
      const e = lattice[r1 + ix + 1];
      const top = a + (b - a) * tx;
      const bot = d + (e - d) * tx;
      out[o + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

/** Per-pixel white noise in [0, 1). */
export function whiteNoise(w: number, h: number, seed: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = hash2(x, y, seed);
  return out;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
}
