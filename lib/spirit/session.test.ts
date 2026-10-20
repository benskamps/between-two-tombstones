import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CAPS, TEST_CAPS, capsFromParam, createSession, formatDuration, stopMessage, type StopReason } from "./session";
import { buildWordBank, type SpiritPerson } from "./wordbank";

const bank = buildWordBank(
  [
    { qid: "Q1", name: "Washington Irving", death: "1859-11-28T00:00:00Z", deathPrecision: 11, occupations: ["writer"] },
    { qid: "Q2", name: "Andrew Carnegie", death: "1919-08-11T00:00:00Z", deathPrecision: 11, occupations: ["industrialist"] },
  ] satisfies SpiritPerson[],
  new Date("2026-10-20T00:00:00Z"),
);

function harness(caps = DEFAULT_CAPS, rng = () => 0.5) {
  const spoken: string[] = [];
  const stops: StopReason[] = [];
  const session = createSession({
    bank,
    caps,
    rng,
    speak: (t) => spoken.push(t),
    onUtterance: () => {},
    onStop: (r) => stops.push(r),
  });
  return { session, spoken, stops };
}

describe("spirit session caps", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("speaks the first fragment synchronously inside start() (iOS needs it in the tap)", () => {
    const h = harness();
    h.session.start();
    expect(h.spoken).toHaveLength(1);
    h.session.stop();
  });

  it("stops at 60 voices and clears every timer", () => {
    const h = harness(DEFAULT_CAPS, () => 0); // shortest gaps: 3 s each → 60 voices in ~3 minutes
    h.session.start();
    vi.advanceTimersByTime(DEFAULT_CAPS.maxMs);
    expect(h.spoken).toHaveLength(60);
    expect(h.stops).toEqual(["utterance-cap"]);
    expect(h.session.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at 10 minutes when voices come slowly", () => {
    const slow = { ...DEFAULT_CAPS, gapMs: [20000, 20000] as [number, number] }; // 20 s apart → 30 in 10 min
    const h = harness(slow);
    h.session.start();
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    expect(h.stops).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(h.stops).toEqual(["time-cap"]);
    expect(h.spoken.length).toBeLessThan(60);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never exceeds the caps with any gap the default range allows", () => {
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const h = harness(DEFAULT_CAPS, () => r);
      h.session.start();
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(h.spoken.length).toBeLessThanOrEqual(60);
      expect(h.stops).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("stop() is immediate, reports once, and leaves no timers", () => {
    const h = harness();
    h.session.start();
    h.session.stop("hidden");
    h.session.stop("user");
    vi.advanceTimersByTime(60 * 1000);
    expect(h.spoken).toHaveLength(1);
    expect(h.stops).toEqual(["hidden"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("short test caps end after 3 voices", () => {
    const h = harness(TEST_CAPS.short);
    h.session.start();
    vi.advanceTimersByTime(10000);
    expect(h.spoken).toHaveLength(3);
    expect(h.stops).toEqual(["utterance-cap"]);
  });

  it("time test caps end on time", () => {
    const h = harness(TEST_CAPS.time);
    h.session.start();
    vi.advanceTimersByTime(TEST_CAPS.time.maxMs);
    expect(h.stops).toEqual(["time-cap"]);
  });
});

describe("caps from the URL", () => {
  it("only shortens", () => {
    expect(capsFromParam(null).caps).toBe(DEFAULT_CAPS);
    expect(capsFromParam("long").caps).toBe(DEFAULT_CAPS);
    for (const k of ["short", "time"] as const) {
      const { caps, test } = capsFromParam(k);
      expect(test).toBe(true);
      expect(caps.maxUtterances).toBeLessThanOrEqual(DEFAULT_CAPS.maxUtterances);
      expect(caps.maxMs).toBeLessThanOrEqual(DEFAULT_CAPS.maxMs);
    }
  });
});

describe("messages", () => {
  it("says why the session stopped", () => {
    expect(formatDuration(10 * 60 * 1000)).toBe("10 minutes");
    expect(formatDuration(4000)).toBe("4 seconds");
    expect(formatDuration(90000)).toBe("1 minute 30 seconds");
    expect(stopMessage("time-cap", DEFAULT_CAPS)).toContain("time’s up after 10 minutes");
    expect(stopMessage("utterance-cap", DEFAULT_CAPS)).toContain("60 voices");
  });
});
