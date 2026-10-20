// Test-only builders for image files with real headers (magic bytes and pixel
// size) and filler after them. The route only sniffs headers, so these are
// enough to exercise it without an image library.

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function withFiller(header: number[], filler: number, seed: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(header.length + filler));
  out.set(header, 0);
  for (let i = header.length; i < out.length; i += 1) out[i] = (i * 31 + seed * 17) & 0xff;
  return out;
}

export function testPng(width: number, height: number, opts: { seed?: number; filler?: number } = {}) {
  const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const header = [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...be32(width), ...be32(height), 8, 2, 0, 0, 0];
  return withFiller(header, opts.filler ?? 256, opts.seed ?? 1);
}

export function testJpeg(width: number, height: number, opts: { seed?: number; filler?: number } = {}) {
  const header = [
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF"), 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0
    0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, // a stub DQT segment to skip over
    0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // SOF0
  ];
  return withFiller(header, opts.filler ?? 256, opts.seed ?? 1);
}

function riff(chunk: number[]) {
  return [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...chunk];
}

export function testWebpVp8x(width: number, height: number, opts: { seed?: number } = {}) {
  const w = width - 1;
  const h = height - 1;
  const header = riff([...ascii("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff]);
  return withFiller(header, 64, opts.seed ?? 1);
}

export function testWebpVp8l(width: number, height: number) {
  const bits = (width - 1) | ((height - 1) << 14);
  const header = riff([...ascii("VP8L"), 5, 0, 0, 0, 0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff]);
  return withFiller(header, 64, 1);
}

export function testWebpVp8(width: number, height: number) {
  const header = riff([...ascii("VP8 "), 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f]);
  return withFiller(header, 64, 1);
}

export function testGif() {
  return withFiller([...ascii("GIF89a"), 10, 0, 10, 0], 64, 1);
}
