// Promise wrapper around the Stamp Kit engine. Browser only: construct it in an
// event handler or effect. The engine runs in workers/stamp.worker.ts; when Web
// Workers are unavailable it runs on the main thread instead (slower UI, same
// results).

import type { FromWorker, ToWorker } from "@/lib/stamp/protocol";
import type { Quad, StampSettings, StampText } from "@/lib/stamp/types";

export type RenderResult = Extract<FromWorker, { type: "rendered" }>;

const START_ERROR = "The Stamp Kit couldn't start in this browser. Try a current Chrome, Firefox or Safari.";

export function stampKitSupported(): boolean {
  return typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined";
}

type Port = {
  postMessage(msg: ToWorker, transfer?: Transferable[]): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  onerror: (() => void) | null;
  terminate(): void;
};

/** Same interface as a Worker, but the engine is loaded into this thread on first use. */
function mainThreadPort(): Port {
  const port: Port = {
    onmessage: null,
    onerror: null,
    postMessage(msg) {
      engine.then((e) => e.receive(msg)).catch(() => port.onerror?.());
    },
    terminate() {},
  };
  // Replies are delivered asynchronously, like worker messages.
  const engine = import("@/workers/stampEngine").then((m) =>
    m.createStampEngine((msg) => setTimeout(() => port.onmessage?.({ data: msg }), 0)),
  );
  return port;
}

export class StampClient {
  /** "worker" normally; "main" when this browser has no Web Workers. */
  readonly mode: "worker" | "main";
  private port: Port;
  private job = 0;
  private waiters = new Map<number, (m: FromWorker) => void>();
  private loadWaiter: ((m: FromWorker) => void) | null = null;
  private failed: string | null = null;

  constructor() {
    if (typeof Worker !== "undefined") {
      this.mode = "worker";
      this.port = new Worker(new URL("../../workers/stamp.worker.ts", import.meta.url), {
        type: "module",
      }) as unknown as Port;
    } else {
      this.mode = "main";
      this.port = mainThreadPort();
    }
    this.port.onmessage = (e) => this.receive(e.data);
    this.port.onerror = () => this.failAll(START_ERROR);
  }

  private failAll(message: string) {
    this.failed = message;
    const err: FromWorker = { type: "error", job: null, message };
    this.loadWaiter?.(err);
    this.loadWaiter = null;
    for (const w of this.waiters.values()) w(err);
    this.waiters.clear();
  }

  private receive(m: FromWorker) {
    if (m.type === "loaded" || m.job === null) {
      const w = this.loadWaiter;
      this.loadWaiter = null;
      w?.(m);
      return;
    }
    const w = this.waiters.get(m.job);
    if (w) {
      this.waiters.delete(m.job);
      w(m);
    }
  }

  private request(build: (job: number) => ToWorker): Promise<FromWorker> {
    if (this.failed) return Promise.resolve({ type: "error", job: null, message: this.failed });
    const job = ++this.job;
    return new Promise((resolve) => {
      this.waiters.set(job, resolve);
      this.port.postMessage(build(job));
    });
  }

  /** Hand the photo to the engine (the bitmap is transferred and unusable afterwards). */
  load(bitmap: ImageBitmap): Promise<{ width: number; height: number }> {
    if (this.failed) return Promise.reject(new Error(this.failed));
    return new Promise((resolve, reject) => {
      this.loadWaiter = (m) => {
        if (m.type === "loaded") resolve({ width: m.width, height: m.height });
        else reject(new Error(m.type === "error" ? m.message : START_ERROR));
      };
      this.port.postMessage({ type: "load", bitmap }, [bitmap]);
    });
  }

  /** Resolves null when a newer render replaced this one. */
  async render(corners: Quad, settings: StampSettings, text: StampText): Promise<RenderResult | null> {
    const m = await this.request((job) => ({ type: "render", job, corners, settings, text }));
    if (m.type === "rendered") return m;
    if (m.type === "cancelled") return null;
    throw new Error(m.type === "error" ? m.message : "Unexpected reply from the Stamp Kit.");
  }

  async kit(text: StampText): Promise<{ sheet: Blob; story: Blob }> {
    const m = await this.request((job) => ({ type: "kit", job, text }));
    if (m.type === "kit") return { sheet: m.sheet, story: m.story };
    throw new Error(m.type === "error" ? m.message : "Unexpected reply from the Stamp Kit.");
  }

  async readImages(corners: Quad): Promise<{ straightened: Blob; contrast: Blob }> {
    const m = await this.request((job) => ({ type: "read-images", job, corners }));
    if (m.type === "read-images") return { straightened: m.straightened, contrast: m.contrast };
    throw new Error(m.type === "error" ? m.message : "Unexpected reply from the Stamp Kit.");
  }

  terminate() {
    this.port.terminate();
    this.failAll("The Stamp Kit was closed.");
  }
}
