// Golden test: the whole pure pipeline on the Irving fixture with fixed corners
// and default settings. The input is a lossless grayscale copy of
// tests/fixtures/stones/WashingtonIrvingGrave.jpg (the pipeline starts from
// luminance, so gray in = same result), because Node has no JPEG decoder.
//
// STAMP_DUMP=1 pnpm vitest run lib/stamp/golden.test.ts writes the stages to
// tests/fixtures/stones/out/ (git-ignored) for a look.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng, maskToImage } from "../../tests/fixtures/stones/png";
import { carveMask, liftCarving, prepareRelief } from "./carve";
import { warpPerspective, warpedSize } from "./homography";
import { contrastBoost, distressInk, engrave, grayToRGBA, inkedFraction, maskToInk, renderRubbing } from "./render";
import { DEFAULT_SETTINGS, type Quad } from "./types";

const DIR = new URL("../../tests/fixtures/stones/", import.meta.url);
const fixture = decodePng(readFileSync(new URL("WashingtonIrvingGrave.gray.png", DIR)));
const meta = JSON.parse(readFileSync(new URL("corners.json", DIR), "utf8"))["WashingtonIrvingGrave.jpg"];
const corners = meta.corners as Quad;

/**
 * Measured 2026-10-20 (Z_WEAK 0.8, Z_STRONG 1.6, STD_FLOOR 0.12, default settings,
 * 816×1000 straightened). Band = ±10%: retuning that moves the count further
 * than that should come with a fresh look at tests/fixtures/stones/out/.
 */
const GOLDEN_MASK_PIXELS = 55125;

describe("golden: Washington Irving's stone", () => {
  const size = warpedSize(corners, { longSide: 1000 });
  const warped = warpPerspective(fixture, corners, size.width, size.height);
  const t0 = performance.now();
  const lift = liftCarving(warped, DEFAULT_SETTINGS);
  const liftMs = performance.now() - t0;

  it("decodes the fixture and straightens it to a 1000 px long side", () => {
    expect(fixture.width).toBe(meta.width);
    expect(fixture.height).toBe(meta.height);
    expect(Math.max(size.width, size.height)).toBe(1000);
    expect(size.width / size.height).toBeCloseTo(280 / 343, 2);
  });

  it("keeps the carving-mask pixel count inside the recorded band", () => {
    if (process.env.STAMP_DUMP) console.log(`[golden] ${JSON.stringify(lift.stats)} lift=${liftMs.toFixed(0)}ms`);
    expect(lift.stats.maskPixels).toBeGreaterThan(GOLDEN_MASK_PIXELS * 0.9);
    expect(lift.stats.maskPixels).toBeLessThan(GOLDEN_MASK_PIXELS * 1.1);
  });

  it("drops every blob that touches the frame edge", () => {
    const { mask, width: w, height: h } = lift;
    // The top corners sit on background (other stones, the flag): those blobs must go.
    expect(lift.stats.droppedEdge).toBeGreaterThan(20);
    let onEdge = 0;
    for (let x = 0; x < w; x++) onEdge += mask[x] + mask[(h - 1) * w + x];
    for (let y = 0; y < h; y++) onEdge += mask[y * w] + mask[y * w + w - 1];
    expect(onEdge).toBe(0);
  });

  it("dump stages for a look (STAMP_DUMP=1)", () => {
    if (!process.env.STAMP_DUMP) return;
    const out = new URL("out/", DIR);
    mkdirSync(out, { recursive: true });
    const { relief, lum, mask, width: w, height: h } = lift;
    writeFileSync(new URL("irving-warped.png", out), encodePng(warped));
    writeFileSync(new URL("irving-mask.png", out), encodePng(maskToImage(mask, w, h)));
    const { mask: light } = carveMask(prepareRelief(warped).relief, w, h, { ...DEFAULT_SETTINGS, mode: "light" });
    writeFileSync(new URL("irving-mask-light.png", out), encodePng(maskToImage(light, w, h)));
    const { mask: edges } = carveMask(relief, w, h, { ...DEFAULT_SETTINGS, mode: "edges" });
    writeFileSync(new URL("irving-mask-edges.png", out), encodePng(maskToImage(edges, w, h)));
    writeFileSync(new URL("irving-contrast.png", out), encodePng(grayToRGBA(contrastBoost(lum, relief), w, h)));
    const rub = renderRubbing(relief, mask, w, h);
    writeFileSync(new URL("irving-rubbing-pixels.png", out), encodePng(rub));
    const ink = maskToInk(mask, w, h);
    distressInk(ink);
    writeFileSync(new URL("irving-ink-pixels.png", out), encodePng(ink));
    writeFileSync(new URL("irving-engraved.png", out), encodePng(engrave(contrastBoost(lum, relief), w, h, { mask })));
    expect(inkedFraction(rub)).toBeGreaterThan(0);
  });
});
