// The bundled fonts for the share images (assets/fonts, licenses there). Read
// once per server instance; `next/og` only takes ttf/otf/woff, so these are
// the TTFs from Google Fonts, the same families the pages load via next/font.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

/** Family names the card JSX uses in `fontFamily`. */
export const OG_FONT = { carved: "IM Fell", body: "Atkinson", space: "Michroma" } as const;

let fonts: Promise<OgFont[]> | null = null;

function arrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// Literal paths under process.cwd(), so the build's file tracing ships the fonts with the function.
async function readAll(): Promise<OgFont[]> {
  const [carved, body, bold, space] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/IMFeENrm28P.ttf")),
    readFile(join(process.cwd(), "assets/fonts/AtkinsonHyperlegible-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/AtkinsonHyperlegible-Bold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Michroma-Regular.ttf")),
  ]);
  return [
    { name: OG_FONT.carved, data: arrayBuffer(carved), weight: 400, style: "normal" },
    { name: OG_FONT.body, data: arrayBuffer(body), weight: 400, style: "normal" },
    { name: OG_FONT.body, data: arrayBuffer(bold), weight: 700, style: "normal" },
    { name: OG_FONT.space, data: arrayBuffer(space), weight: 400, style: "normal" },
  ];
}

export function shareFonts(): Promise<OgFont[]> {
  fonts ??= readAll().catch((err) => {
    fonts = null; // a failed read is retried on the next image, never cached
    throw err;
  });
  return fonts;
}
