import { describe, expect, it } from "vitest";
import { loadCemetery, parseBurials, routeError, type SampleCemetery } from "./load";
import { clampSweepMs, randomBandFrequency, SWEEP_MAX_MS, SWEEP_MIN_MS } from "./engine";
import { pickVoice, voiceParams } from "./voice";

const fallback: SampleCemetery = {
  qid: "Q2008469",
  name: "Oakland Cemetery",
  place: "Atlanta, Georgia",
  fetchedAt: "2026-10-20T01:50:00Z",
  people: [{ qid: "Q1", name: "Margaret Mitchell", death: "1949-08-16T00:00:00Z", deathPrecision: 11, occupations: [] }],
};

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const snapshot = {
  cemetery: { qid: "Q872253", name: "Lake View Cemetery" },
  fetchedAt: "2026-10-21T00:00:00Z",
  sources: {},
  people: [
    { qid: "Q5", name: "Doc Maynard", death: "1873-03-13T00:00:00Z", deathPrecision: 11, occupations: ["physician"], extra: 1 },
    { name: "no qid" },
  ],
};

describe("parseBurials", () => {
  it("keeps valid people and the cemetery name", () => {
    const p = parseBurials(snapshot);
    expect(p?.name).toBe("Lake View Cemetery");
    expect(p?.people).toEqual([
      { qid: "Q5", name: "Doc Maynard", death: "1873-03-13T00:00:00Z", deathPrecision: 11, occupations: ["physician"] },
    ]);
  });
  it("rejects things that aren't snapshots", () => {
    expect(parseBurials(null)).toBeNull();
    expect(parseBurials({ error: { source: "Wikidata", message: "down" } })).toBeNull();
    expect(parseBurials({ cemetery: { name: "x" }, people: "no" })).toBeNull();
  });
  it("words route errors", () => {
    expect(routeError({ error: { source: "Wikidata", message: "Couldn't reach Wikidata." } }, 503)).toBe(
      "Wikidata: Couldn't reach Wikidata.",
    );
    expect(routeError(null, 404)).toContain("isn't available yet");
    expect(routeError(null, 500)).toContain("500");
  });
});

describe("loadCemetery", () => {
  it("uses the live route when it answers", async () => {
    const r = await loadCemetery("Q872253", { fetchImpl: fakeFetch(200, snapshot) });
    expect(r.ok && r.cemetery.source).toBe("live");
    expect(r.ok && r.cemetery.name).toBe("Lake View Cemetery");
  });
  it("falls back to the saved copy when the route is missing", async () => {
    const r = await loadCemetery("Q2008469", { fetchImpl: fakeFetch(404, "<html>not found</html>"), fallback });
    expect(r.ok && r.cemetery.source).toBe("saved");
    expect(r.ok && r.note).toContain("isn't available yet");
  });
  it("falls back when the route reports an outage", async () => {
    const r = await loadCemetery("Q2008469", {
      fetchImpl: fakeFetch(503, { error: { source: "Wikidata", message: "Wikidata is switched off." } }),
      fallback,
    });
    expect(r.ok && r.note).toContain("Wikidata: Wikidata is switched off.");
  });
  it("names the failure when there's no saved copy", async () => {
    const r = await loadCemetery("Q872253", {
      fetchImpl: fakeFetch(503, { error: { source: "Wikidata", message: "Wikidata is switched off." } }),
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("Wikidata is switched off.");
  });
  it("gives up after the timeout", async () => {
    const never = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const r = await loadCemetery("Q872253", { fetchImpl: never, timeoutMs: 50 });
    expect(!r.ok && r.message).toContain("no answer within");
  });
});

describe("engine and voice helpers", () => {
  it("clamps the sweep slider to 50–350 ms", () => {
    expect(clampSweepMs(10)).toBe(SWEEP_MIN_MS);
    expect(clampSweepMs(999)).toBe(SWEEP_MAX_MS);
    expect(clampSweepMs(149.6)).toBe(150);
    expect(clampSweepMs(Number.NaN)).toBe(150);
  });
  it("keeps band frequencies in range", () => {
    for (const r of [0, 0.5, 0.999]) {
      const f = randomBandFrequency(() => r);
      expect(f).toBeGreaterThanOrEqual(250);
      expect(f).toBeLessThanOrEqual(3800);
    }
  });
  it("keeps voices low and slowish", () => {
    for (const r of [0, 0.5, 0.999]) {
      const { pitch, rate } = voiceParams(() => r);
      expect(pitch).toBeGreaterThanOrEqual(0.1);
      expect(pitch).toBeLessThanOrEqual(0.4);
      expect(rate).toBeGreaterThanOrEqual(0.55);
      expect(rate).toBeLessThanOrEqual(0.8);
    }
  });
  it("prefers an ordinary English voice and skips novelty voices", () => {
    const v = (lang: string, name = lang, extra: Partial<SpeechSynthesisVoice> = {}) =>
      ({ lang, name, default: false, localService: false, ...extra }) as SpeechSynthesisVoice;
    expect(pickVoice([v("fr-FR"), v("en-GB")])?.lang).toBe("en-GB");
    expect(pickVoice([v("en-US", "Bubbles"), v("en-US", "Cellos"), v("en-US", "Fred")])?.name).toBe("Fred");
    expect(pickVoice([v("en-US", "A"), v("en-GB", "B", { default: true })])?.name).toBe("B");
    expect(pickVoice([v("fr-FR")])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});
