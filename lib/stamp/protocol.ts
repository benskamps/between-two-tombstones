// Messages between the /stamp page and workers/stamp.worker.ts.

import type { CarveStats } from "./carve";
import type { Quad, StampSettings, StampText } from "./types";

export type ToWorker =
  /** A new photo (already downsized on the main thread). Transfer the bitmap. */
  | { type: "load"; bitmap: ImageBitmap }
  /** Straighten, lift and render all three. A newer render job cancels older ones. */
  | { type: "render"; job: number; corners: Quad; settings: StampSettings; text: StampText }
  /** Kit sheet (1080×1350) and story (1080×1920) from the last finished render. */
  | { type: "kit"; job: number; text: StampText }
  /** Straightened and contrast-boosted JPEGs (≤ 1600 px) for "Read with Claude". */
  | { type: "read-images"; job: number; corners: Quad };

export type RenderTimings = {
  warp: number;
  relief: number;
  mask: number;
  rubbing: number;
  ink: number;
  postage: number;
  /** PNG encoding of all three (in parallel). */
  encode: number;
  /** Pipeline wall time inside the worker, encoding included. */
  total: number;
};

export type FromWorker =
  | { type: "loaded"; width: number; height: number }
  | {
      type: "rendered";
      job: number;
      rubbing: Blob;
      ink: Blob;
      postage: Blob;
      width: number;
      height: number;
      stats: CarveStats;
      timings: RenderTimings;
    }
  | { type: "kit"; job: number; sheet: Blob; story: Blob }
  | { type: "read-images"; job: number; straightened: Blob; contrast: Blob }
  | { type: "cancelled"; job: number }
  | { type: "error"; job: number | null; message: string };
