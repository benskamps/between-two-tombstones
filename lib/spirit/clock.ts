// The shared clock for séance mode. Phones ask GET /api/time a few times and
// keep the answer with the shortest round trip (Cristian's algorithm):
// offset = serverNow + rtt / 2 − clientNow. Shared time is then
// Date.now() + offset. If the server can't be reached, the phone's own clock
// is used and the page says voices may drift.

export const TIME_PATH = "/api/time";
/** Requests per sync. */
export const CLOCK_SAMPLES = 3;
/** Per request. */
export const CLOCK_TIMEOUT_MS = 3000;

export type ClockSample = { offset: number; rtt: number };

export type ClockSync =
  | { source: "server"; offset: number; rtt: number; samples: number }
  | { source: "device"; offset: 0; reason: string };

/** One round trip: sent at t0, the server said serverNow, the answer came back at t1 (all ms). */
export function cristian(t0: number, serverNow: number, t1: number): ClockSample {
  const rtt = Math.max(0, t1 - t0);
  return { rtt, offset: serverNow + rtt / 2 - t1 };
}

/** The sample with the shortest round trip: the least room for the network to skew it. */
export function bestSample(samples: readonly ClockSample[]): ClockSample | null {
  let best: ClockSample | null = null;
  for (const s of samples) if (best === null || s.rtt < best.rtt) best = s;
  return best;
}

function serverTime(json: unknown): number | null {
  const now = (json as { now?: unknown } | null)?.now;
  return typeof now === "number" && Number.isFinite(now) ? now : null;
}

/**
 * Up to CLOCK_SAMPLES sequential requests, each with its own timeout. Stops at
 * the first failure and uses whatever samples it already has; with none, falls
 * back to the device clock (offset 0) and says why.
 */
export async function syncClock(
  opts: {
    fetchImpl?: typeof fetch;
    now?: () => number;
    samples?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ClockSync> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const count = Math.max(1, Math.min(CLOCK_SAMPLES, opts.samples ?? CLOCK_SAMPLES));
  const timeoutMs = opts.timeoutMs ?? CLOCK_TIMEOUT_MS;
  const got: ClockSample[] = [];
  let problem = "";

  for (let i = 0; i < count; i++) {
    if (opts.signal?.aborted) {
      problem = "cancelled";
      break;
    }
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const t0 = now();
      const res = await fetchImpl(TIME_PATH, {
        cache: "no-store",
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      const t1 = now();
      if (!res.ok) {
        problem = `the time server answered ${res.status}`;
        break;
      }
      const serverNow = serverTime(await res.json().catch(() => null));
      if (serverNow === null) {
        problem = "the time server sent something that isn't a time";
        break;
      }
      got.push(cristian(t0, serverNow, t1));
    } catch {
      problem = opts.signal?.aborted
        ? "cancelled"
        : `no answer from the time server within ${Math.round(timeoutMs / 1000)} seconds`;
      break;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }

  const best = bestSample(got);
  if (best) return { source: "server", offset: best.offset, rtt: best.rtt, samples: got.length };
  return { source: "device", offset: 0, reason: problem || "no samples" };
}
