import { describe, expect, it } from "vitest";
import { clientIp, newDeviceCookie, readDeviceId } from "./device";
import { detectImageType, imageSize } from "./image";
import { billedCostUsd, DailyBudget, DAY, estimateCostUsd, LruCache, MINUTE, SlidingWindowLimiter, whenAgain } from "./limits";
import { checkReading, implausibleDate, matchKey, normalizeLegibility } from "./postcheck";
import { testGif, testJpeg, testPng, testWebpVp8, testWebpVp8l, testWebpVp8x } from "./test-images";
import type { ModelReading } from "./types";

describe("image sniffing", () => {
  it("knows JPEG, PNG and WebP by their bytes and reads the pixel size", () => {
    expect(detectImageType(testJpeg(1600, 1200))).toBe("image/jpeg");
    expect(imageSize(testJpeg(1600, 1200), "image/jpeg")).toEqual({ width: 1600, height: 1200 });
    expect(detectImageType(testPng(900, 1600))).toBe("image/png");
    expect(imageSize(testPng(900, 1600), "image/png")).toEqual({ width: 900, height: 1600 });
    expect(imageSize(testWebpVp8x(1200, 1600), "image/webp")).toEqual({ width: 1200, height: 1600 });
    expect(imageSize(testWebpVp8l(640, 480), "image/webp")).toEqual({ width: 640, height: 480 });
    expect(imageSize(testWebpVp8(800, 600), "image/webp")).toEqual({ width: 800, height: 600 });
  });

  it("rejects anything else", () => {
    expect(detectImageType(testGif())).toBeNull();
    expect(detectImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });

  it("returns null for a truncated header", () => {
    expect(imageSize(testJpeg(100, 100).slice(0, 30), "image/jpeg")).toBeNull();
    expect(imageSize(testPng(100, 100).slice(0, 20), "image/png")).toBeNull();
  });
});

describe("device cookie and client IP", () => {
  it("signs and verifies, and refuses tampered or foreign cookies", () => {
    const { id, setCookie } = newDeviceCookie("secret-a");
    expect(setCookie).toMatch(/^btt_dev=[\w-]+\.[\w-]{43}; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/);
    const value = setCookie.split(";")[0];
    expect(readDeviceId(`theme=dark; ${value}`, "secret-a")).toBe(id);
    expect(readDeviceId(value, "secret-b")).toBeNull();
    expect(readDeviceId(value.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "secret-a")).toBeNull();
    expect(readDeviceId("btt_dev=made-up-id-1234567.abc", "secret-a")).toBeNull();
    expect(readDeviceId(null, "secret-a")).toBeNull();
  });

  it("takes the first forwarded hop, then x-real-ip", () => {
    const req = (headers: Record<string, string>) => new Request("http://x/", { headers });
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(req({ "x-forwarded-for": "<script>" }))).toBe("unknown");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("limits", () => {
  it("allows 5 in 10 minutes, then says when the next one fits", () => {
    const limiter = new SlidingWindowLimiter({ burst: { ms: 10 * MINUTE, max: 5 }, daily: { ms: DAY, max: 20 } });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.check("a", t0 + i * MINUTE).ok).toBe(true);
      limiter.record("a", t0 + i * MINUTE);
    }
    const verdict = limiter.check("a", t0 + 5 * MINUTE);
    expect(verdict).toEqual({ ok: false, rule: "burst", retryAfterMs: 5 * MINUTE });
    expect(limiter.check("a", t0 + 10 * MINUTE + 1).ok).toBe(true);
    expect(limiter.check("b", t0).ok).toBe(true);
  });

  it("enforces the daily count across bursts", () => {
    const limiter = new SlidingWindowLimiter({ burst: { ms: 10 * MINUTE, max: 5 }, daily: { ms: DAY, max: 20 } });
    let t = 0;
    for (let i = 0; i < 20; i += 1) {
      t = i * 11 * MINUTE;
      expect(limiter.check("a", t).ok).toBe(true);
      limiter.record("a", t);
    }
    const verdict = limiter.check("a", t + 11 * MINUTE);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.rule).toBe("daily");
      expect(verdict.retryAfterMs).toBe(DAY - 20 * 11 * MINUTE);
    }
  });

  it("caps how many keys it remembers", () => {
    const limiter = new SlidingWindowLimiter({ burst: { ms: MINUTE, max: 1 }, daily: { ms: DAY, max: 1 } }, 3);
    for (const key of ["a", "b", "c", "d"]) limiter.record(key, 0);
    expect(limiter.size).toBe(3);
    expect(limiter.check("a", 1).ok).toBe(true); // "a" was evicted first
    expect(limiter.check("d", 1).ok).toBe(false);
  });

  it("LRU evicts the least recently used and expires old entries", () => {
    const cache = new LruCache<number>(2, 1000);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    expect(cache.get("a", 1)).toBe(1); // a is now most recent
    cache.set("c", 3, 1);
    expect(cache.get("b", 2)).toBeUndefined();
    expect(cache.get("a", 2)).toBe(1);
    expect(cache.get("a", 2000)).toBeUndefined();
  });

  it("prices usage at Sonnet 5.5 rates and resets the budget at midnight UTC", () => {
    expect(estimateCostUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(2);
    expect(estimateCostUsd({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(10);
    expect(estimateCostUsd({ input_tokens: 5000, output_tokens: 1500 })).toBeCloseTo(0.025, 10);
    const budget = new DailyBudget();
    const noon = Date.UTC(2026, 9, 20, 12);
    budget.add(1, noon);
    expect(budget.isOver(1, noon)).toBe(true);
    expect(budget.isOver(1, Date.UTC(2026, 9, 21, 0, 1))).toBe(false);
    expect(DailyBudget.msUntilReset(noon)).toBe(12 * 60 * MINUTE);
    const release = budget.reserve(0.5);
    expect(budget.isOver(0.5, Date.UTC(2026, 9, 21, 1))).toBe(true);
    release();
    release();
    expect(budget.isOver(0.5, Date.UTC(2026, 9, 21, 1))).toBe(false);
  });

  it("holds a read's worst case only while it fits under the cap, then settles to the real cost", () => {
    const budget = new DailyBudget();
    const noon = Date.UTC(2026, 9, 20, 12);
    const holds = [1, 2, 3, 4].map(() => budget.tryReserve(0.3, 1, noon));
    expect(holds.map((h) => h !== null)).toEqual([true, true, true, false]); // 3 × 0.3 fits under 1; a 4th doesn't
    expect(budget.committed(noon)).toBeCloseTo(0.9, 10);
    holds[0]!.settle(0.02, noon); // cost far less than its worst case
    holds[0]!.settle(0.02, noon); // settling twice counts once
    expect(budget.committed(noon)).toBeCloseTo(0.62, 10);
    holds[1]!.release();
    holds[1]!.release();
    expect(budget.committed(noon)).toBeCloseTo(0.32, 10);
    expect(budget.tryReserve(0.3, 1, noon)).not.toBeNull();
    expect(budget.tryReserve(0.3, 1, noon)).not.toBeNull();
    expect(budget.tryReserve(0.3, 1, noon)).toBeNull();
    expect(budget.committed(noon)).toBeLessThanOrEqual(1);
  });

  it("bills a server-side fallback's declined attempt too", () => {
    const top = { input_tokens: 5000, output_tokens: 1500 };
    expect(billedCostUsd(top)).toBeCloseTo(0.025, 10);
    const iterations = [
      { type: "message", input_tokens: 5000, output_tokens: 800 },
      { type: "fallback_message", input_tokens: 5000, output_tokens: 1500 },
    ];
    expect(billedCostUsd({ ...top, iterations })).toBeCloseTo(0.043, 10);
    // A single attempt listed once is not counted twice.
    expect(billedCostUsd({ ...top, iterations: [{ type: "message", ...top }] })).toBeCloseTo(0.025, 10);
  });

  it("says when to try again in plain words", () => {
    expect(whenAgain(20_000)).toBe("in about a minute");
    expect(whenAgain(4 * MINUTE - 1)).toBe("in 4 minutes");
    expect(whenAgain(150 * MINUTE)).toBe("in 3 hours");
  });
});

describe("post-check", () => {
  const base: ModelReading = {
    transcription: "SACRED\nto the memory of\nJOHN WEBB\nwho died\nMar. 4, 1851\nAged 34 y'rs 2 m's 11 d's",
    people: [{ name: "John Webb", birth: null, death: "Mar. 4, 1851", aged: "34 y'rs 2 m's 11 d's", unsure: [] }],
    epitaph: null,
    symbols: [{ name: "weeping willow", meaning: "Mourning." }],
    material: "slate",
    legibility: "clear",
    notes: null,
  };

  it("keeps dates and ages that are in the transcription", () => {
    const reading = checkReading(base, { currentYear: 2026 });
    expect(reading.people).toEqual([{ name: "John Webb", death: "Mar. 4, 1851", aged: "34 y'rs 2 m's 11 d's" }]);
    expect(reading.checks).toEqual([]);
    expect(reading.material).toBe("slate");
    expect("epitaph" in reading).toBe(false);
  });

  it("takes out dates Claude marked unsure", () => {
    const reading = checkReading(
      { ...base, people: [{ ...base.people[0], unsure: ["death"] }] },
      { currentYear: 2026 },
    );
    expect(reading.people[0].death).toBeUndefined();
    expect(reading.people[0].aged).toBe("34 y'rs 2 m's 11 d's");
    expect(reading.checks).toEqual(["Left out John Webb's death date: Claude wasn't sure of the reading."]);
  });

  it("takes out completed or invented dates that aren't carved", () => {
    const reading = checkReading(
      {
        ...base,
        transcription: "JOHN WEBB\ndied Mar. 4, 18[?]1",
        people: [{ name: "John Webb", birth: "Dec. 21, 1816", death: "Mar. 4, 1851", aged: null, unsure: [] }],
      },
      { currentYear: 2026 },
    );
    expect(reading.people[0]).toEqual({ name: "John Webb" });
    expect(reading.checks).toEqual([
      `Left out John Webb's birth date ("Dec. 21, 1816"): it isn't in the transcription of the stone.`,
      `Left out John Webb's death date ("Mar. 4, 1851"): it isn't in the transcription of the stone.`,
    ]);
  });

  it("keeps an honest partial date with [?]", () => {
    const reading = checkReading(
      {
        ...base,
        transcription: "JOHN WEBB\ndied Mar. 4, 18[?]1",
        people: [{ name: "John Webb", birth: null, death: "Mar. 4, 18[?]1", aged: null, unsure: [] }],
      },
      { currentYear: 2026 },
    );
    expect(reading.people[0].death).toBe("Mar. 4, 18[?]1");
  });

  it("takes out impossible years even when they are in the transcription", () => {
    const reading = checkReading(
      {
        ...base,
        transcription: "JOHN WEBB 2091",
        people: [{ name: "John Webb", birth: null, death: "2091", aged: null, unsure: [] }],
      },
      { currentYear: 2026 },
    );
    expect(reading.people[0].death).toBeUndefined();
    expect(reading.checks[0]).toContain("the year 2091 can't be right");
  });

  it("flags a name that isn't on the stone", () => {
    const reading = checkReading(
      { ...base, people: [{ ...base.people[0], name: "Washington Irving" }] },
      { currentYear: 2026 },
    );
    expect(reading.checks).toContain(`The name "Washington Irving" isn't in the transcription. Check it against the stone.`);
  });

  it("normalizes legibility words", () => {
    expect(normalizeLegibility("Clear")).toBe("clear");
    expect(normalizeLegibility("partially legible")).toBe("partial");
    expect(normalizeLegibility("illegible")).toBe("poor");
    expect(normalizeLegibility("???")).toBeNull();
    const reading = checkReading({ ...base, legibility: "unknown" }, { currentYear: 2026 });
    expect(reading.legibility).toBe("partial");
    expect(reading.checks[0]).toContain("didn't say how readable");
  });

  it("matches ignoring case, spacing and punctuation but never digits", () => {
    expect(matchKey("DEC. 21 , 1816")).toBe(matchKey("Dec 21, 1816"));
    expect(matchKey("Dec. 21, 1818")).not.toBe(matchKey("Dec. 21, 1816"));
    expect(matchKey("Æt. 72")).toBe("aet72");
    expect(implausibleDate("Mar. 4, 1851", 2026)).toBeNull();
    expect(implausibleDate("[?]", 2026)).toBe("nothing in it can be read as a date");
    expect(implausibleDate("0851", 2026)).toBe("the year 851 can't be right");
    expect(implausibleDate("Mar. 4, 185111", 2026)).toBe("it has more digits than a date");
    expect(implausibleDate("Fourth Month 3rd Day 1783", 2026)).toBeNull();
  });
});
