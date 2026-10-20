import type { Point, Quad, RGBAImage } from "./types";

/**
 * Projective map from the unit square to a quad (Heckbert 1989, "Fundamentals of
 * Texture Mapping and Image Warping", section 2.2.3). (0,0)→q[0], (1,0)→q[1],
 * (1,1)→q[2], (0,1)→q[3]. Returns [a, b, c, d, e, f, g, h] for
 *   x = (a·u + b·v + c) / (g·u + h·v + 1)
 *   y = (d·u + e·v + f) / (g·u + h·v + 1)
 */
export function squareToQuad(q: Quad): Float64Array {
  const [p0, p1, p2, p3] = q;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const m = new Float64Array(8);
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    // Parallelogram: the map is affine.
    m[0] = p1.x - p0.x;
    m[1] = p2.x - p1.x;
    m[2] = p0.x;
    m[3] = p1.y - p0.y;
    m[4] = p2.y - p1.y;
    m[5] = p0.y;
    return m;
  }
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  m[0] = p1.x - p0.x + g * p1.x;
  m[1] = p3.x - p0.x + h * p3.x;
  m[2] = p0.x;
  m[3] = p1.y - p0.y + g * p1.y;
  m[4] = p3.y - p0.y + h * p3.y;
  m[5] = p0.y;
  m[6] = g;
  m[7] = h;
  return m;
}

export function applySquareToQuad(m: Float64Array, u: number, v: number): Point {
  const z = m[6] * u + m[7] * v + 1;
  return { x: (m[0] * u + m[1] * v + m[2]) / z, y: (m[3] * u + m[4] * v + m[5]) / z };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Output size for a straightened quad: aspect from the average of opposite edge
 * lengths. The long side is set to `longSide` when given, else the natural size
 * capped at `maxSide`.
 */
export function warpedSize(q: Quad, opts: { longSide?: number; maxSide?: number } = {}) {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  const natural = Math.max(w, h, 1);
  const target = opts.longSide ?? Math.min(natural, opts.maxSide ?? 1000);
  const s = target / natural;
  return { width: Math.max(8, Math.round(w * s)), height: Math.max(8, Math.round(h * s)) };
}

/** True when the quad is convex and wound clockwise in screen space (y down), so the warp is well defined. */
export function isUsableQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign > 0;
}

/** Default framing: the photo inset by `inset` of each side. */
export function defaultQuad(width: number, height: number, inset = 0.1): Quad {
  const x0 = Math.round(width * inset);
  const y0 = Math.round(height * inset);
  const x1 = Math.round(width * (1 - inset)) - 1;
  const y1 = Math.round(height * (1 - inset)) - 1;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/**
 * Straighten the quad in `src` into a width×height image. Every output pixel is
 * inverse-mapped through the square→quad homography and sampled bilinearly. The
 * numerators and the denominator are linear in the output x, so each row walks
 * them by addition.
 */
export function warpPerspective(src: RGBAImage, q: Quad, width: number, height: number): RGBAImage {
  const m = squareToQuad(q);
  const out = new Uint8ClampedArray(width * height * 4);
  const s = src.data;
  const sw = src.width;
  const sh = src.height;
  const maxX = sw - 1;
  const maxY = sh - 1;
  const du = 1 / width;
  const dX = m[0] * du;
  const dY = m[3] * du;
  const dZ = m[6] * du;
  let o = 0;
  for (let oy = 0; oy < height; oy++) {
    const v = (oy + 0.5) / height;
    const u0 = 0.5 * du;
    let X = m[0] * u0 + m[1] * v + m[2];
    let Y = m[3] * u0 + m[4] * v + m[5];
    let Z = m[6] * u0 + m[7] * v + 1;
    for (let ox = 0; ox < width; ox++) {
      const iz = 1 / Z;
      let sx = X * iz - 0.5;
      let sy = Y * iz - 0.5;
      if (sx < 0) sx = 0;
      else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0;
      else if (sy > maxY) sy = maxY;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      out[o] = s[i00] * w00 + s[i10] * w10 + s[i01] * w01 + s[i11] * w11;
      out[o + 1] = s[i00 + 1] * w00 + s[i10 + 1] * w10 + s[i01 + 1] * w01 + s[i11 + 1] * w11;
      out[o + 2] = s[i00 + 2] * w00 + s[i10 + 2] * w10 + s[i01 + 2] * w01 + s[i11 + 2] * w11;
      out[o + 3] = 255;
      o += 4;
      X += dX;
      Y += dY;
      Z += dZ;
    }
  }
  return { data: out, width, height };
}
