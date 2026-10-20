// Generates the app icons from one hand-drawn SVG: an arched headstone under a
// crescent moon on the night-theme background (#0e110f, app/globals.css).
// Rasterized with Playwright's Chromium, so it needs no image dependency.
//
//   node lib/seo/generate-icons.mjs
//
// Writes:
//   public/icons/icon-192.png, icon-512.png   manifest, purpose "any" (rounded tile)
//   public/icons/maskable-512.png             manifest, purpose "maskable" (full bleed,
//                                             art inside the 80% safe circle)
//   app/icon.svg                              favicon (Next adds the <link>)
//   app/apple-icon.png                        180x180, full bleed (iOS rounds it)

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const C = {
  bg: "#0e110f",
  stone: "#d9d2c1",
  stoneShade: "#b3ae9c",
  groove: "#8f8878",
  moss: "#9db58f",
  moon: "#e2ad4b",
};

// Drawn on a 512 grid, centered on (256, 256).
const art = `
  <mask id="crescent">
    <rect width="512" height="512" fill="white"/>
    <circle cx="394" cy="118" r="40" fill="black"/>
  </mask>
  <clipPath id="stone"><path d="M150 404V236a106 106 0 0 1 212 0v168z"/></clipPath>
  <circle cx="372" cy="136" r="46" fill="${C.moon}" mask="url(#crescent)"/>
  <path d="M150 404V236a106 106 0 0 1 212 0v168z" fill="${C.stone}"/>
  <rect x="328" y="120" width="40" height="290" fill="${C.stoneShade}" clip-path="url(#stone)"/>
  <rect x="196" y="244" width="120" height="14" rx="7" fill="${C.groove}"/>
  <rect x="210" y="280" width="92" height="14" rx="7" fill="${C.groove}"/>
  <rect x="196" y="316" width="120" height="14" rx="7" fill="${C.groove}"/>
  <rect x="88" y="396" width="336" height="28" rx="14" fill="${C.moss}"/>
`;

/** @param {{ tile: "rounded" | "full", scale: number }} o */
function svg({ tile, scale }) {
  const bg =
    tile === "rounded"
      ? `<rect width="512" height="512" rx="112" fill="${C.bg}"/>`
      : `<rect width="512" height="512" fill="${C.bg}"/>`;
  const t = scale === 1 ? "" : ` transform="translate(256 256) scale(${scale}) translate(-256 -256)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}<g${t}>${art}</g></svg>`;
}

const anyIcon = svg({ tile: "rounded", scale: 1 });
// Farthest art point is ~238 px from center; 0.72 keeps it inside the 205 px safe radius.
const maskable = svg({ tile: "full", scale: 0.72 });
const apple = svg({ tile: "full", scale: 0.86 });

const outputs = [
  { file: "public/icons/icon-192.png", svg: anyIcon, size: 192 },
  { file: "public/icons/icon-512.png", svg: anyIcon, size: 512 },
  { file: "public/icons/maskable-512.png", svg: maskable, size: 512 },
  { file: "app/apple-icon.png", svg: apple, size: 180 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, svg: markup, size } of outputs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        markup.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `) +
        `</body></html>`,
    );
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), png);
    console.log(`wrote ${file} (${size}x${size}, ${png.length} bytes)`);
  }
} finally {
  await browser.close();
}

await writeFile(join(root, "app/icon.svg"), anyIcon + "\n");
console.log("wrote app/icon.svg");
