// Stamp Kit engine: straightens the stone, lifts the carving and draws the three
// renders on OffscreenCanvas. It normally runs inside workers/stamp.worker.ts;
// StampClient runs it on the main thread only when Web Workers are unavailable.
// The pixel math lives in lib/stamp (pure, unit-tested); this file wires it to
// canvases.
//
// Cancellation: render jobs run one at a time and yield between stages. A newer
// "render" message bumps `latestRender`; an older job sees that at its next
// yield and stops.

import { datesLine } from "../lib/stamp/age";
import { carveMask, prepareRelief } from "../lib/stamp/carve";
import { warpPerspective, warpedSize } from "../lib/stamp/homography";
import { fitRect, kitLayout, perforationCentres, rotatedBounds, type KitKind } from "../lib/stamp/layout";
import type { FromWorker, RenderTimings, ToWorker } from "../lib/stamp/protocol";
import { READ_BODY_BUDGET } from "../lib/stamp/readStone";
import {
  ENGRAVING,
  INK,
  STAMP_PAPER,
  contrastBoost,
  distressInk,
  engrave,
  grayToRGBA,
  maskToInk,
  renderRubbing,
  type RGB,
} from "../lib/stamp/render";
import type { Quad, RGBAImage, StampSettings, StampText } from "../lib/stamp/types";

/** The straightened stone is always worked at this long side, so cost and look don't depend on the photo. */
const WORK_SIDE = 1000;
/** Long-side cap for the images sent to the reader. */
const READ_SIDE = 1600;
const SERIF = "Georgia, 'Noto Serif', 'Times New Roman', serif";
const DEFAULT_HEADER = "Between Two Tombstones";

/**
 * Yield to the event loop so a newer job's message can arrive. A MessageChannel
 * hop isn't subject to the 4 ms clamp on nested timers or to background-tab
 * timer throttling (which can stretch a setTimeout(0) to a second).
 */
const yieldQueue: (() => void)[] = [];
const yieldChannel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
if (yieldChannel) yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();
const tick = () =>
  new Promise<void>((resolve) => {
    if (!yieldChannel) return void setTimeout(resolve, 0);
    yieldQueue.push(resolve);
    yieldChannel.port2.postMessage(0);
  });
const rgb = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const cornersKey = (q: Quad) => q.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(";");

function ctx2d(c: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const g = c.getContext("2d");
  if (!g) throw new Error("This browser can't draw off-screen. Try a current Chrome or Safari.");
  return g;
}

function toCanvas(img: RGBAImage): OffscreenCanvas {
  const c = new OffscreenCanvas(img.width, img.height);
  ctx2d(c).putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return c;
}

/** Set the largest font ≤ size px whose rendering of `text` fits maxW. */
function fitFont(g: OffscreenCanvasRenderingContext2D, text: string, maxW: number, size: number, weight = "bold") {
  g.font = `${weight} ${size}px ${SERIF}`;
  const w = g.measureText(text).width;
  if (w > maxW) {
    const s = Math.max(8, Math.floor((size * maxW) / w));
    g.font = `${weight} ${s}px ${SERIF}`;
    return s;
  }
  return size;
}

class Stale extends Error {}

/** Bounding box of the mask with a margin, or the whole image when the mask is empty. */
function maskBounds(mask: Uint8Array, w: number, h: number) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[o + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  const m = Math.round(Math.max(w, h) * 0.03);
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m);
  y1 = Math.min(h - 1, y1 + m);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Ink stamp: double frame, header line, the carving in ink, distressed, rotated −2°, transparent background. */
type InkArt = { canvas: OffscreenCanvas; b: { x: number; y: number; w: number; h: number } };

function inkArt(mask: Uint8Array, w: number, h: number): InkArt {
  return { canvas: toCanvas(maskToInk(mask, w, h, INK)), b: maskBounds(mask, w, h) };
}

function drawInkStamp(artIn: InkArt, text: StampText): OffscreenCanvas {
  const { b, canvas: art } = artIn;
  // Fit the carving into an area about 900 px on its long side.
  const scale = 900 / Math.max(b.w, b.h);
  const aw = Math.round(b.w * scale);
  const ah = Math.round(b.h * scale);
  const outer = 22;
  const gap = 14;
  const inner = 7;
  const margin = 30;
  const frame = margin + outer + gap + inner;
  const headerH = 96;
  const dates = datesLine(text.born, text.died);
  const footerH = dates ? 64 : 0;
  const width = Math.max(aw, 560) + frame * 2 + 48;
  const height = ah + headerH + footerH + frame * 2 + 48;

  const c = new OffscreenCanvas(width, height);
  const g = ctx2d(c);
  g.strokeStyle = rgb(INK);
  g.fillStyle = rgb(INK);
  g.lineWidth = outer;
  g.strokeRect(margin + outer / 2, margin + outer / 2, width - 2 * margin - outer, height - 2 * margin - outer);
  g.lineWidth = inner;
  const ii = margin + outer + gap + inner / 2;
  g.strokeRect(ii, ii, width - 2 * ii, height - 2 * ii);

  const header = (text.name.trim() || dates || DEFAULT_HEADER).toUpperCase();
  const innerW = width - 2 * frame - 40;
  g.textAlign = "center";
  g.textBaseline = "middle";
  fitFont(g, header, innerW, 58);
  g.fillText(header, width / 2, frame + 24 + headerH / 2 - 8);
  g.fillRect(frame + 30, frame + 24 + headerH - 6, width - 2 * frame - 60, 5);
  if (dates) {
    fitFont(g, dates, innerW, 40, "normal");
    g.fillText(dates, width / 2, height - frame - 24 - footerH / 2 + 4);
  }
  g.imageSmoothingQuality = "high";
  g.drawImage(art, b.x, b.y, b.w, b.h, (width - aw) / 2, frame + 24 + headerH, aw, ah);

  const id = g.getImageData(0, 0, width, height);
  distressInk({ data: id.data, width, height }, 11);
  g.putImageData(id, 0, 0);

  const deg = -2;
  const r = rotatedBounds(width, height, deg);
  const out = new OffscreenCanvas(r.width, r.height);
  const go = ctx2d(out);
  go.imageSmoothingQuality = "high";
  go.translate(r.width / 2, r.height / 2);
  go.rotate((deg * Math.PI) / 180);
  go.drawImage(c, -width / 2, -height / 2);
  return out;
}

/** Postage stamp: engraved-line screen, frame, name band, the age at death as the value, perforated edges. */
function engravedPlate(lum: Float32Array, relief: Float32Array, mask: Uint8Array, w: number, h: number) {
  return toCanvas(engrave(contrastBoost(lum, relief), w, h, { mask, angle: 45 }));
}

function drawPostage(plate: OffscreenCanvas, text: StampText): OffscreenCanvas {
  const w = plate.width;
  const h = plate.height;
  const side = Math.max(w, h);
  const m = Math.round(side * 0.075);
  const band = Math.round(side * 0.15);
  const width = w + 2 * m;
  const height = h + 2 * m + band;
  const c = new OffscreenCanvas(width, height);
  const g = ctx2d(c);
  g.fillStyle = rgb(STAMP_PAPER);
  g.fillRect(0, 0, width, height);
  g.drawImage(plate, m, m);

  const ink = rgb(ENGRAVING);
  g.strokeStyle = ink;
  g.lineWidth = Math.max(3, side * 0.008);
  g.strokeRect(m, m, w, h);
  g.lineWidth = Math.max(2, side * 0.004);
  const fi = m * 0.5;
  g.strokeRect(fi, fi, width - 2 * fi, height - 2 * fi);

  // Band: the name on the left, the value on the right.
  g.fillStyle = ink;
  const bandTop = m + h;
  const bandMid = bandTop + (height - fi - bandTop) / 2;
  const value = text.age !== null && Number.isFinite(text.age) ? String(Math.round(text.age)) : null;
  const valueSize = Math.round(band * 0.78);
  let valueW = 0;
  if (value) {
    g.font = `bold ${valueSize}px ${SERIF}`;
    g.textAlign = "right";
    g.textBaseline = "middle";
    const unitSize = Math.round(band * 0.2);
    g.fillText(value, width - m - unitSize * 2.6, bandMid + band * 0.03);
    valueW = g.measureText(value).width + unitSize * 2.8;
    g.font = `bold ${unitSize}px ${SERIF}`;
    g.textAlign = "left";
    g.fillText("YRS", width - m - unitSize * 2.4, bandMid + band * 0.12);
  }
  const name = (text.name.trim() || "In Memoriam").toUpperCase();
  const maxNameW = width - 2 * m - valueW - 24;
  g.textAlign = "left";
  g.textBaseline = "middle";
  fitFont(g, name, maxNameW, Math.round(band * 0.32));
  g.fillText(name, m, bandMid - band * 0.12);
  fitFont(g, DEFAULT_HEADER.toUpperCase(), maxNameW, Math.round(band * 0.17), "normal");
  g.fillText(DEFAULT_HEADER.toUpperCase(), m, bandMid + band * 0.22);

  // Perforations: semicircle bites along every edge.
  g.globalCompositeOperation = "destination-out";
  const pr = Math.max(6, Math.round(side * 0.018));
  for (const p of perforationCentres(width, height, pr)) {
    g.beginPath();
    g.arc(p.x, p.y, pr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  return c;
}

export type StampEngine = { receive(msg: ToWorker): void };

/** One engine per photo session. `post` delivers replies (postMessage in the worker). */
export function createStampEngine(post: (msg: FromWorker) => void): StampEngine {
  let source: RGBAImage | null = null;
  let latestRender = 0;
  let chain: Promise<void> = Promise.resolve();

  let warpCache: { key: string; img: RGBAImage; lum: Float32Array; relief: Float32Array } | null = null;
  let maskCache: { key: string; mask: Uint8Array; stats: ReturnType<typeof carveMask>["stats"] } | null = null;
  let lastRenders: { rubbing: OffscreenCanvas; ink: OffscreenCanvas; postage: OffscreenCanvas } | null = null;
  // Render parts that depend only on the mask (not on the words), keyed like maskCache.
  let partsCache: { key: string; rubbing: OffscreenCanvas; rubbingBlob: Blob | null; art: InkArt; plate: OffscreenCanvas } | null =
    null;

  function load(bitmap: ImageBitmap) {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = c.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
    if (!g) throw new Error("This browser can't draw off-screen. Try a current Chrome or Safari.");
    g.drawImage(bitmap, 0, 0);
    const id = g.getImageData(0, 0, bitmap.width, bitmap.height);
    source = { data: id.data, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    warpCache = null;
    maskCache = null;
    partsCache = null;
    lastRenders = null;
    post({ type: "loaded", width: source.width, height: source.height });
  }

  async function render(msg: Extract<ToWorker, { type: "render" }>) {
    const { job, corners, settings, text } = msg;
    const check = async () => {
      await tick();
      if (job !== latestRender) throw new Stale();
    };
    if (!source) throw new Error("Choose a photo first.");
    const t0 = performance.now();
    const timings: RenderTimings = { warp: 0, relief: 0, mask: 0, rubbing: 0, ink: 0, postage: 0, encode: 0, total: 0 };
    await check();

    const key = cornersKey(corners);
    if (!warpCache || warpCache.key !== key) {
      let t = performance.now();
      const size = warpedSize(corners, { longSide: WORK_SIDE });
      const img = warpPerspective(source, corners, size.width, size.height);
      timings.warp = performance.now() - t;
      await check();
      t = performance.now();
      const { lum, relief } = prepareRelief(img);
      timings.relief = performance.now() - t;
      warpCache = { key, img, lum, relief };
      maskCache = null;
      await check();
    }
    const { img, lum, relief } = warpCache;
    const { width: w, height: h } = img;

    const mkey = `${key}|${settings.mode}|${settings.grit}|${settings.stroke}`;
    if (!maskCache || maskCache.key !== mkey) {
      const t = performance.now();
      const res = carveMask(relief, w, h, settings as StampSettings);
      timings.mask = performance.now() - t;
      maskCache = { key: mkey, ...res };
      await check();
    }
    const { mask, stats } = maskCache;

    let t = performance.now();
    if (!partsCache || partsCache.key !== mkey) {
      const rubbing = toCanvas(renderRubbing(relief, mask, w, h));
      timings.rubbing = performance.now() - t;
      await check();
      t = performance.now();
      const art = inkArt(mask, w, h);
      timings.ink = performance.now() - t;
      await check();
      t = performance.now();
      const plate = engravedPlate(lum, relief, mask, w, h);
      timings.postage = performance.now() - t;
      partsCache = { key: mkey, rubbing, rubbingBlob: null, art, plate };
      await check();
    }
    const parts = partsCache;

    // The words only touch the ink stamp's header and the postage stamp's band.
    t = performance.now();
    const ink = drawInkStamp(parts.art, text);
    timings.ink += performance.now() - t;
    t = performance.now();
    const postage = drawPostage(parts.plate, text);
    timings.postage += performance.now() - t;
    await check();

    t = performance.now();
    const [rb, ib, pb] = await Promise.all([
      parts.rubbingBlob ?? parts.rubbing.convertToBlob({ type: "image/png" }),
      ink.convertToBlob({ type: "image/png" }),
      postage.convertToBlob({ type: "image/png" }),
    ]);
    parts.rubbingBlob = rb;
    timings.encode = performance.now() - t;
    if (job !== latestRender) throw new Stale();
    lastRenders = { rubbing: parts.rubbing, ink, postage };
    timings.total = performance.now() - t0;
    post({ type: "rendered", job, rubbing: rb, ink: ib, postage: pb, width: w, height: h, stats, timings });
  }

  function drawKit(kind: KitKind, text: StampText): OffscreenCanvas {
    if (!lastRenders) throw new Error("Make the stamps first.");
    const L = kitLayout(kind);
    const c = new OffscreenCanvas(L.size.width, L.size.height);
    const g = ctx2d(c);
    g.fillStyle = "#efe7d6";
    g.fillRect(0, 0, L.size.width, L.size.height);

    const ink = "#1d1a17";
    g.fillStyle = ink;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    const name = text.name.trim() || "Stamp Kit";
    const dates = datesLine(text.born, text.died);
    const titleSize = fitFont(g, name, L.title.w, kind === "story" ? 96 : 84);
    g.fillText(name, L.title.x + L.title.w / 2, L.title.y + titleSize);
    if (dates) {
      fitFont(g, dates, L.title.w, 48, "normal");
      g.fillText(dates, L.title.x + L.title.w / 2, L.title.y + titleSize + 66);
    }

    g.imageSmoothingQuality = "high";
    const place = (src: OffscreenCanvas, box: typeof L.rubbing, shadow: boolean) => {
      const r = fitRect({ width: src.width, height: src.height }, box);
      g.save();
      if (shadow) {
        g.shadowColor = "rgba(0,0,0,0.28)";
        g.shadowBlur = 18;
        g.shadowOffsetY = 6;
      }
      g.drawImage(src, r.x, r.y, r.w, r.h);
      g.restore();
    };
    place(lastRenders.rubbing, L.rubbing, true);
    place(lastRenders.ink, L.ink, false);
    place(lastRenders.postage, L.postage, true);

    g.fillStyle = "#4a443b";
    fitFont(g, "Between Two Tombstones · made from a photo, no stone was touched", L.footer.w, 30, "normal");
    g.fillText(
      "Between Two Tombstones · made from a photo, no stone was touched",
      L.footer.x + L.footer.w / 2,
      L.footer.y + L.footer.h / 2 + 10,
    );
    return c;
  }

  async function kit(msg: Extract<ToWorker, { type: "kit" }>) {
    const sheet = drawKit("sheet", msg.text);
    const story = drawKit("story", msg.text);
    const [sb, tb] = await Promise.all([
      sheet.convertToBlob({ type: "image/png" }),
      story.convertToBlob({ type: "image/png" }),
    ]);
    post({ type: "kit", job: msg.job, sheet: sb, story: tb });
  }

  async function readImages(msg: Extract<ToWorker, { type: "read-images" }>) {
    if (!source) throw new Error("Choose a photo first.");
    const size = warpedSize(msg.corners, { maxSide: READ_SIDE });
    const img = warpPerspective(source, msg.corners, size.width, size.height);
    const { lum, relief } = prepareRelief(img);
    const straightCanvas = toCanvas(img);
    const contrastCanvas = toCanvas(grayToRGBA(contrastBoost(lum, relief), img.width, img.height));
    // JPEG q 0.85 at <= 1600 px is normally well under budget; step the quality down if a busy photo isn't.
    for (const quality of [0.85, 0.72, 0.6]) {
      const [straightened, contrast] = await Promise.all([
        straightCanvas.convertToBlob({ type: "image/jpeg", quality }),
        contrastCanvas.convertToBlob({ type: "image/jpeg", quality }),
      ]);
      if (straightened.size + contrast.size <= READ_BODY_BUDGET || quality === 0.6) {
        post({ type: "read-images", job: msg.job, straightened, contrast });
        return;
      }
    }
  }

  async function handle(msg: ToWorker) {
    const job = msg.type === "load" ? null : msg.job;
    try {
      if (msg.type === "load") load(msg.bitmap);
      else if (msg.type === "render") await render(msg);
      else if (msg.type === "kit") await kit(msg);
      else if (msg.type === "read-images") await readImages(msg);
    } catch (err) {
      if (err instanceof Stale && job !== null) {
        post({ type: "cancelled", job });
        return;
      }
      const message = err instanceof Error ? err.message : "Something went wrong making the stamps.";
      post({ type: "error", job, message });
    }
  }

  return {
    receive(msg: ToWorker) {
      if (msg.type === "render") latestRender = msg.job;
      chain = chain.then(() => handle(msg));
    },
  };
}
