import { afterEach, describe, expect, it, vi } from "vitest";
import { USER_AGENT } from "@/lib/site";
import { HttpError, politeFetch } from "./wikimedia";

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

  it("spaces requests to the same host at least 1 s apart", async () => {
    stubFetch([() => new Response("{}"), () => new Response("{}")]);
    const t = Date.now();
    await Promise.all([politeFetch("https://space.test/a", {}, opts()), politeFetch("https://space.test/b", {}, opts())]);
    expect(Date.now() - t).toBeGreaterThanOrEqual(950);
  });
});
