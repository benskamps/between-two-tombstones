import { describe, expect, it } from "vitest";
import { loadCemetery, parseBurials, routeError, toSpiritPerson, type SampleCemetery } from "./load";
import { SAMPLE_CEMETERIES } from "./samples";
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
  it("words route errors, naming the source once (review 4, #3)", () => {
    expect(routeError({ error: { source: "Wikidata", message: "Couldn't reach Wikidata." } }, 503)).toBe("Couldn't reach Wikidata.");
    // The route's own message: the tour's next step comes off; the spirit box says its own.
    expect(
      routeError({ error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute, or open a saved tour." } }, 503),
    ).toBe("Couldn't reach Wikidata.");
    expect(routeError({ error: { source: "Wikidata", message: "test outage" } }, 503)).toBe("Wikidata: test outage.");
    expect(routeError(null, 404)).toContain("isn't available yet");
    expect(routeError(null, 500)).toContain("500");
  });
});

describe("never an ID for a name (F20)", () => {
  const base = { qid: "Q6986296", death: "1882-02-03T00:00:00Z", deathPrecision: 11, occupations: [] };

  it("names a bare-QID person from the Wikipedia title, or leaves them out", () => {
    expect(toSpiritPerson({ ...base, name: "Q6986296", wikipedia: { title: "Nedom L. Angier" } })?.name).toBe("Nedom L. Angier");
    expect(toSpiritPerson({ ...base, name: "Q6986296", wikipedia: { title: "Nedom L. Angier (politician)" } })?.name).toBe("Nedom L. Angier");
    expect(toSpiritPerson({ ...base, name: "Q6986296", wikipedia: null })).toBeNull();
    expect(toSpiritPerson({ ...base, name: "Q6986296" })).toBeNull();
    expect(toSpiritPerson({ ...base, name: "Margaret Mitchell" })?.name).toBe("Margaret Mitchell");
  });

  it("the bundled samples carry no QID names; Oakland's two unlabelled people come back by their article titles", () => {
    for (const c of SAMPLE_CEMETERIES) expect(c.people.filter((p) => /^Q\d+$/.test(p.name.trim())), c.name).toEqual([]);
    const oakland = SAMPLE_CEMETERIES.find((c) => c.qid === "Q2008469")!;
    expect(oakland.people.find((p) => p.qid === "Q6986296")?.name).toBe("Nedom L. Angier");
    expect(oakland.people.find((p) => p.qid === "Q6066179")?.name).toBe("Ira O. McDaniel");
  });

  it("a live snapshot from the route gets the same repair", () => {
    const p = parseBurials({ ...snapshot, people: [{ ...base, name: "Q6986296", wikipedia: { title: "Nedom L. Angier" } }, { ...base, qid: "Q9", name: "Q9" }] });
    expect(p?.people.map((x) => x.name)).toEqual(["Nedom L. Angier"]);
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
    expect(r.ok && r.note).toBe("Couldn't load fresh names, so this uses the copy saved with the app. Wikidata is switched off.");
  });
  it("names the failure when there's no saved copy", async () => {
    const r = await loadCemetery("Q872253", {
      fetchImpl: fakeFetch(503, { error: { source: "Wikidata", message: "Wikidata is switched off." } }),
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("Wikidata is switched off.");
  });
  it("says the route's failure once, with one full stop (review 4, #3)", async () => {
    const r = await loadCemetery("Q216344", {
      fetchImpl: fakeFetch(503, { error: { source: "Wikidata", message: "Couldn't reach Wikidata. Try again in a minute, or open a saved tour." } }),
    });
    expect(!r.ok && r.message).toBe("Couldn't load the burials for this cemetery. Couldn't reach Wikidata.");
  });
  it("gives up after the timeout", async () => {
    const never = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const r = await loadCemetery("Q872253", { fetchImpl: never, timeoutMs: 50 });
    expect(!r.ok && r.message).toMatch(/^Couldn't load the burials for this cemetery\. No answer within \d+ seconds \(you may be offline\)\.$/);
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
