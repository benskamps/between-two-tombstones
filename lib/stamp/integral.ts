// Summed-area tables: any box sum in four lookups, so box filters cost O(n)
// whatever the window size.

/** (w+1)×(h+1) summed-area table of `src` (and of src² when `squares` is given). */
export function integralImage(src: Float32Array, w: number, h: number, squares?: Float64Array): Float64Array {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    let row2 = 0;
    const si = y * w;
    const o = (y + 1) * W;
    const p = y * W;
    for (let x = 0; x < w; x++) {
      const v = src[si + x];
      row += v;
      sum[o + x + 1] = sum[p + x + 1] + row;
      if (squares) {
        row2 += v * v;
        squares[o + x + 1] = squares[p + x + 1] + row2;
      }
    }
  }
  return sum;
}

/**
 * Mean over a (2r+1)² window clamped to the image, for every pixel. When
 * `stdOut` is given it also receives the local standard deviation.
 */
export function boxMean(
  src: Float32Array,
  w: number,
  h: number,
  r: number,
  out: Float32Array = new Float32Array(w * h),
  stdOut?: Float32Array,
): Float32Array {
  const W = w + 1;
  const sq = stdOut ? new Float64Array(W * (h + 1)) : undefined;
  const sum = integralImage(src, w, h, sq);
  for (let y = 0; y < h; y++) {
    const y0 = y - r < 0 ? 0 : y - r;
    const y1 = y + r + 1 > h ? h : y + r + 1;
    const a = y0 * W;
    const b = y1 * W;
    const rows = y1 - y0;
    const o = y * w;
    for (let x = 0; x < w; x++) {
      const x0 = x - r < 0 ? 0 : x - r;
      const x1 = x + r + 1 > w ? w : x + r + 1;
      const n = rows * (x1 - x0);
      const s = sum[b + x1] - sum[b + x0] - sum[a + x1] + sum[a + x0];
      const mean = s / n;
      out[o + x] = mean;
      if (sq && stdOut) {
        const s2 = sq[b + x1] - sq[b + x0] - sq[a + x1] + sq[a + x0];
        const v = s2 / n - mean * mean;
        stdOut[o + x] = v > 0 ? Math.sqrt(v) : 0;
      }
    }
  }
  return out;
}
