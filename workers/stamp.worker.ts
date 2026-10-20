// Stamp Kit worker entry: runs the engine off the main thread. Bundled by
// Turbopack from `new Worker(new URL("../../workers/stamp.worker.ts", import.meta.url), { type: "module" })`
// in components/stamp/stampClient.ts.

import type { FromWorker, ToWorker } from "../lib/stamp/protocol";
import { createStampEngine } from "./stampEngine";

type WorkerScope = {
  postMessage(message: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
const scope = self as unknown as WorkerScope;

const engine = createStampEngine((msg) => scope.postMessage(msg));
scope.onmessage = (e) => engine.receive(e.data);
