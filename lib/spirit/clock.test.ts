import { describe, expect, it } from "vitest";
import { CLOCK_SAMPLES, TIME_PATH, bestSample, cristian, syncClock } from "./clock";

describe("Cristian's algorithm", () => {
  it("adds half the round trip to the server's time", () => {
    // Sent at 1000 (phone), server said 5050, answer at 1100: rtt 100, true now 5100, offset 4000.
    expect(cristian(1000, 5050, 1100)).toEqual({ rtt: 100, offset: 4000 });
    expect(cristian(1000, 900, 1000)).toEqual({ rtt: 0, offset: -100 });
  });

  it("keeps the sample with the lowest round trip", () => {
    const samples = [
      { rtt: 120, offset: 30 },
      { rtt: 18, offset: -7 },
      { rtt: 64, offset: 12 },
    ];
    expect(bestSample(samples)).toEqual({ rtt: 18, offset: -7 });
    expect(bestSample([])).toBeNull();
  });
});

/**
 * A fake network: the phone's clock is `skew` ms behind the server. Each request
 * takes `up` ms to reach the server and `down` ms to come back.
 */
function network(trips: { up: number; down: number }[], skew: number) {
  let phone = 1_000_000;
  let i = 0;
  const calls: { url: string; cache?: RequestCache }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, cache: init?.cache });
    const trip = trips[i++] ?? trips[trips.length - 1];
    phone += trip.up;
    const serverNow = phone + skew;
    phone += trip.down;
    return new Response(JSON.stringify({ now: serverNow }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, now: () => phone, calls };
}

describe("syncClock", () => {
  it("takes 3 samples from /api/time, no-store, and uses the one with the lowest round trip", async () => {
    // Trip 2 is fast and symmetric, so it gives the exact skew; the slow lopsided ones don't.
    const net = network(
      [
        { up: 300, down: 20 },
        { up: 10, down: 10 },
        { up: 40, down: 200 },
      ],
      -2500,
    );
    const r = await syncClock({ fetchImpl: net.fetchImpl, now: net.now });
    expect(net.calls).toHaveLength(CLOCK_SAMPLES);
    for (const c of net.calls) expect(c).toEqual({ url: TIME_PATH, cache: "no-store" });
    expect(r).toEqual({ source: "server", offset: -2500, rtt: 20, samples: 3 });
  });

  it("falls back to the phone's clock when the server answers with an error, without retrying", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch;
    const r = await syncClock({ fetchImpl });
    expect(calls).toBe(1);
    expect(r).toEqual({ source: "device", offset: 0, reason: "the time server answered 500" });
  });

  it("keeps the samples it already has when a later request fails", async () => {
    let calls = 0;
    let t = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 2) throw new TypeError("Failed to fetch");
      t += 50;
      return new Response(JSON.stringify({ now: t + 1000 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await syncClock({ fetchImpl, now: () => t });
    expect(calls).toBe(2);
    expect(r).toEqual({ source: "server", offset: 1025, rtt: 50, samples: 1 });
  });

  it("rejects answers that aren't a time", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ now: "soon" }), { status: 200 })) as unknown as typeof fetch;
    const r = await syncClock({ fetchImpl });
    expect(r.source).toBe("device");
    expect(r.source === "device" && r.reason).toContain("isn't a time");
  });

  it("gives up on a request after the timeout", async () => {
    const never = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    const started = Date.now();
    const r = await syncClock({ fetchImpl: never, timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(r.source === "device" && r.reason).toContain("no answer from the time server");
  });
});
