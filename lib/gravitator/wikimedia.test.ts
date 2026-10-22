import { afterEach, describe, expect, it, vi } from "vitest";
import { USER_AGENT } from "@/lib/site";
import { HttpError, MAX_QUEUED_PER_HOST, politeFetch, QueueError } from "./wikimedia";

afterEach(() => vi.unstubAllGlobals());

const opts = (over = {}) => ({ timeoutMs: 5000, retries: 2, maxRetryWaitMs: 2000, deadline: Date.now() + 20000, ...over });

function stubFetch(responses: (() => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      return next();
    }),
  );
  return calls;
}

describe("politeFetch", () => {
  it("sends our User-Agent", async () => {
    const calls = stubFetch([() => new Response("{}")]);
    await politeFetch("https://ua.test/x", {}, opts());
    expect((calls[0].init.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("waits out a short Retry-After on 429 and tries again", async () => {
    const calls = stubFetch([
      () => new Response("slow down", { status: 429, headers: { "Retry-After": "1" } }),
      () => new Response("{}", { status: 200 }),
    ]);
    const t = Date.now();
    const res = await politeFetch("https://retry.test/x", {}, opts());
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(Date.now() - t).toBeGreaterThanOrEqual(950);
  });

  it("gives up at once when Retry-After is longer than we can wait", async () => {
    const calls = stubFetch([() => new Response("slow down", { status: 429, headers: { "Retry-After": "33" } })]);
    await expect(politeFetch("https://long.test/x", {}, opts())).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it("stops after the retry cap", async () => {
    const calls = stubFetch([
      () => new Response("", { status: 503, headers: { "Retry-After": "1" } }),
      () => new Response("", { status: 503, headers: { "Retry-After": "1" } }),
    ]);
    await expect(politeFetch("https://cap.test/x", {}, opts({ retries: 1 }))).rejects.toThrow("503 from cap.test");
    expect(calls).toHaveLength(2);
  });

  it("doesn't start a request it can't finish before the deadline", async () => {
    const calls = stubFetch([() => new Response("{}")]);
    await expect(politeFetch("https://late.test/x", {}, opts({ deadline: Date.now() + 500 }))).rejects.toThrow(/out of time/);
    expect(calls).toHaveLength(0);
  });

  it("a request whose turn comes too close to the deadline fails without being sent (red team P1-3)", async () => {
    const sentAt: number[] = [];
    const t0 = Date.now();
    vi.stubGlobal("fetch", async () => {
      sentAt.push(Date.now() - t0);
      await new Promise((r) => setTimeout(r, 600));
      return new Response("{}");
    });
    // Six decks' requests arrive together with a 2.6 s budget. Turns come 1 s apart:
    // at 0 and 1 s there is still 1.5 s left; at 2 s there isn't.
    const deadline = t0 + 2_600;
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => politeFetch(`https://deadline.test/${i}`, {}, opts({ retries: 0, deadline }))),
    );
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "rejected", "rejected", "rejected", "rejected"]);
    for (const r of results.slice(2)) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(QueueError);
    expect(sentAt).toHaveLength(2);
    expect(Math.max(...sentAt)).toBeLessThanOrEqual(deadline - t0 - 1_500);
    // The late ones gave up at their turn, not after a fetch of their own.
    expect(Date.now() - t0).toBeLessThan(2_600);
  });

  it("holds at most 10 requests per host and turns the next ones away at once", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const fetchFn = vi.fn(async () => {
      await gate;
      return new Response("{}");
    });
    vi.stubGlobal("fetch", fetchFn);
    // The deadline leaves time for the first request only; the queued ones then fail at their turn.
    const deadline = Date.now() + 1_800;
    const pending = Array.from({ length: MAX_QUEUED_PER_HOST + 2 }, (_, i) =>
      politeFetch(`https://full.test/${i}`, {}, opts({ retries: 2, deadline })).then(
        () => "sent",
        (e: unknown) => (e instanceof QueueError && /already waiting/.test(e.message) ? "turned away" : "late"),
      ),
    );
    const early = await Promise.race([Promise.all(pending.slice(MAX_QUEUED_PER_HOST)), new Promise((r) => setTimeout(() => r("still waiting"), 50))]);
    expect(MAX_QUEUED_PER_HOST).toBe(10);
    expect(early).toEqual(["turned away", "turned away"]); // within 50 ms, nothing sent for them
    release();
    const outcomes = await Promise.all(pending);
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "late")).toHaveLength(MAX_QUEUED_PER_HOST - 1);
    expect(fetchFn).toHaveBeenCalledTimes(1); // a full or late queue is never retried
    // Once the queue drains, the host takes requests again.
    stubFetch([() => new Response("{}")]);
    await expect(politeFetch("https://full.test/again", {}, opts())).resolves.toBeInstanceOf(Response);
  });

  it("spaces requests to the same host at least 1 s apart", async () => {
    stubFetch([() => new Response("{}"), () => new Response("{}")]);
    const t = Date.now();
    await Promise.all([politeFetch("https://space.test/a", {}, opts()), politeFetch("https://space.test/b", {}, opts())]);
    expect(Date.now() - t).toBeGreaterThanOrEqual(950);
  });
});
