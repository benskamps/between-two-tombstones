// One spirit box session: picks a fragment every few seconds, hands it to a
// speaker, logs it, and stops itself at the caps. No DOM here; the speaker and
// the clock are passed in, so the caps can be tested with fake timers.

import { pickFragment, type WordBank } from "./wordbank";

export type SpiritCaps = {
  /** Stop after this many voices. */
  maxUtterances: number;
  /** Stop after this long, in ms. */
  maxMs: number;
  /** Pause between voices, [min, max] ms. */
  gapMs: [number, number];
};

export const DEFAULT_CAPS: SpiritCaps = {
  maxUtterances: 60,
  maxMs: 10 * 60 * 1000,
  gapMs: [3000, 8000],
};

/**
 * Shorter caps for automated tests (`?test-caps=short|time`). They can only make
 * a session end sooner, never run longer, so honoring them in any build is safe.
 */
export const TEST_CAPS: Record<"short" | "time", SpiritCaps> = {
  short: { maxUtterances: 3, maxMs: 60 * 1000, gapMs: [700, 1200] },
  time: { maxUtterances: 60, maxMs: 4000, gapMs: [1500, 2000] },
};

export function capsFromParam(value: string | null): { caps: SpiritCaps; test: boolean } {
  if (value === "short" || value === "time") return { caps: TEST_CAPS[value], test: true };
  return { caps: DEFAULT_CAPS, test: false };
}

export type StopReason = "user" | "utterance-cap" | "time-cap" | "hidden" | "unmount";

export type Utterance = { n: number; text: string; at: number };

export type SessionOptions = {
  bank: WordBank;
  caps?: SpiritCaps;
  rng?: () => number;
  now?: () => number;
  /** Speak (or just show) a fragment. Called synchronously from start() for the first one (iOS). */
  speak: (text: string) => void;
  onUtterance: (u: Utterance) => void;
  onStop: (reason: StopReason) => void;
  /** Time the last voice gets to finish before the session closes at the utterance cap. */
  tailMs?: number;
};

export type SpiritSession = {
  start(): void;
  stop(reason?: StopReason): void;
  isRunning(): boolean;
  count(): number;
};

export function createSession(opts: SessionOptions): SpiritSession {
  const caps = opts.caps ?? DEFAULT_CAPS;
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? Date.now;
  const tailMs = opts.tailMs ?? Math.min(2500, caps.gapMs[0]);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let running = false;
  let spoken = 0;
  let startedAt = 0;

  function later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function clearAll() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function stop(reason: StopReason = "user") {
    if (!running) return;
    running = false;
    clearAll();
    opts.onStop(reason);
  }

  function gap() {
    const [lo, hi] = caps.gapMs;
    return lo + Math.floor(rng() * Math.max(0, hi - lo));
  }

  function next() {
    if (!running) return;
    if (now() - startedAt >= caps.maxMs) return stop("time-cap");
    if (spoken >= caps.maxUtterances) return stop("utterance-cap");
    const text = pickFragment(opts.bank, rng);
    spoken += 1;
    opts.onUtterance({ n: spoken, text, at: now() });
    opts.speak(text);
    if (spoken >= caps.maxUtterances) later(() => stop("utterance-cap"), tailMs);
    else later(next, gap());
  }

  return {
    start() {
      if (running) return;
      running = true;
      spoken = 0;
      startedAt = now();
      later(() => stop("time-cap"), caps.maxMs);
      next();
    },
    stop,
    isRunning: () => running,
    count: () => spoken,
  };
}

/** "10 minutes", "4 seconds", "1 minute 30 seconds". */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s || !m) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function stopMessage(reason: StopReason, caps: SpiritCaps): string {
  switch (reason) {
    case "utterance-cap":
      return `Session over: ${caps.maxUtterances} voices is the limit for one session. Tap Start to listen again.`;
    case "time-cap":
      return `Session over: time’s up after ${formatDuration(caps.maxMs)}. Tap Start to listen again.`;
    case "hidden":
      return "Stopped because you left the page.";
    case "unmount":
    case "user":
      return "Stopped.";
  }
}
