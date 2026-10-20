// TEMPORARY parameter sweep; deleted before commit.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { decodePng, encodePng, maskToImage } from "../../tests/fixtures/stones/png";
import { close3, countOn, filterComponents, gritToArea, labelComponents, localThreshold, prepareRelief } from "./carve";
import { warpPerspective, warpedSize } from "./homography";
import { boxMean } from "./integral";
import type { Quad } from "./types";

const DIR = new URL("../../tests/fixtures/stones/", import.meta.url);

function hysteresis(weak: Uint8Array, strong: Uint8Array, w: number, h: number) {
  const { labels, count } = labelComponents(weak, w, h);
  const hit = new Uint8Array(count + 1);
  for (let i = 0; i < weak.length; i++) if (strong[i] && labels[i]) hit[labels[i]] = 1;
  const out = new Uint8Array(weak.length);
  for (let i = 0; i < out.length; i++) out[i] = hit[labels[i]];
  return out;
}

it("sweep", () => {
  const name = process.env.TUNE_FILE ?? "WashingtonIrvingGrave";
  const grayPath =
    name === "WashingtonIrvingGrave" ? new URL(`${name}.gray.png`, DIR) : new URL(`out/${name}.gray.png`, DIR);
  const fixture = decodePng(readFileSync(grayPath));
  const corners = JSON.parse(readFileSync(new URL("corners.json", DIR), "utf8"))[`${name}.jpg`].corners as Quad;
  const size = warpedSize(corners, { longSide: 1000 });
  const warped = warpPerspective(fixture, corners, size.width, size.height);
  const { relief } = prepareRelief(warped);
  const { width: w, height: h } = warped;
  const out = new URL("out/tune/", DIR);
  mkdirSync(out, { recursive: true });
  const configs = (process.env.TUNE_CFG ?? "0:0.9:0.9:40").split(" ");
  const lines: string[] = [];
  for (const cfg of configs) {
    const [sm, zl, zh, g, fl] = cfg.split(":").map(Number);
    const floor = fl || 0.045;
    const rel = sm > 0 ? boxMean(relief, w, h, sm) : relief;
    const weak = close3(localThreshold(rel, w, h, "dark", zl, floor), w, h);
    const strong = localThreshold(rel, w, h, "dark", zh, floor);
    const seeded = zh > zl ? hysteresis(weak, strong, w, h) : weak;
    const { mask, stats } = filterComponents(seeded, w, h, gritToArea(g, w, h));
    lines.push(`${name} cfg=${cfg} mask=${countOn(mask)} kept=${stats.kept}`);
    writeFileSync(new URL(`${name}-${cfg.replace(/:/g, "_")}.png`, out), encodePng(maskToImage(mask, w, h)));
  }
  writeFileSync(new URL(`${name}-summary.txt`, out), lines.join("\n"));
});
