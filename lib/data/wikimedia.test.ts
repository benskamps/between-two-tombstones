import { afterEach, describe, expect, it, vi } from "vitest";
import { USER_AGENT } from "@/lib/site";
import { asDataSourceError, DataSourceError } from "./errors";
import { DEFAULTS, parseRetryAfter, politeJson, REQUEST_PATH, setTransportForTests } from "./wikimedia";
import { sparql } from "./wikidata";
import { fetchExtracts } from "./wikipedia";

/** A fake clock + sleep that records every wait. */
function fakeTime() {
  let t = 1_000_000;
  const waits: number[] = [];
  return {
    waits,
    now: () => t,
    sleep: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
  };
}

function scripted(responses: (Response | Error)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("no more scripted responses");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const status = (code: number, headers: Record<string, string> = {}) => new Response("busy", { status: code, headers });

afterEach(() => {
  setTransportForTests(null);
  vi.unstubAllEnvs();
});

describe("politeJson", () => {
  it("sends the site User-Agent and returns parsed JSON", async () => {
    const time = fakeTime();
    const { fetchFn, calls } = scripted([ok({ hello: "world" })]);
    setTransportForTests({ fetch: fetchFn, ...time });
    await expect(politeJson("https://query.wikidata.org/sparql?q=1", { source: "Wikidata" })).resolves.toEqual({ hello: "world" });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["Api-User-Agent"]).toBe(USER_AGENT);
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("honors Retry-After on 429, then succeeds", async () => {
    const time = fakeTime();
    const { fetchFn } = scripted([status(429, { "retry-after": "3" }), ok({ n: 1 })]);
    setTransportForTests({ fetch: fetchFn, ...time });
    await expect(politeJson("https://en.wikipedia.org/w/api.php", { source: "Wikipedia" })).resolves.toEqual({ n: 1 });
    expect(time.waits).toContain(3000);
  });

  it("gives up at once, without retrying, when Retry-After is longer than 20 s", async () => {
    const time = fakeTime();
    const { fetchFn } = scripted([status(429, { "retry-after": "50" }), ok({ never: true })]);
    setTransportForTests({ fetch: fetchFn, ...time });
    const err = (await politeJson("https://en.wikipedia.org/w/api.php", { source: "Wikipedia" }).catch((e: unknown) => e)) as DataSourceError;
    expect(err).toBeInstanceOf(DataSourceError);
    expect(err).toMatchObject({ source: "Wikipedia", kind: "rate-limited", status: 429, retryAfterSeconds: 50 });
    expect(err.httpStatus).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(Math.max(0, ...time.waits)).toBeLessThanOrEqual(DEFAULTS.maxWaitMs);
  });

  it("then fails fast for the same host while the Retry-After window is open", async () => {
    const time = fakeTime();
    const { fetchFn } = scripted([status(429, { "retry-after": "50" })]);
    setTransportForTests({ fetch: fetchFn, ...time });
    await politeJson("https://en.wikipedia.org/w/api.php?a", { source: "Wikipedia" }).catch(() => {});
    const second = (await politeJson("https://en.wikipedia.org/w/api.php?b", { source: "Wikipedia" }).catch((e: unknown) => e)) as DataSourceError;
    expect(second).toMatchObject({ kind: "rate-limited" });
    expect(fetchFn).toHaveBeenCalledTimes(1); // the second call never went out
  });

  it("retries 5xx at most 3 times (4 attempts) with capped backoff", async () => {
    const time = fakeTime();
    const { fetchFn } = scripted([status(502), status(502), status(502), status(502), ok({})]);
    setTransportForTests({ fetch: fetchFn, ...time });
    const err = (await politeJson("https://query.wikidata.org/sparql", { source: "Wikidata" }).catch((e: unknown) => e)) as DataSourceError;
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(err).toMatchObject({ source: "Wikidata", kind: "bad-response", status: 502 });
    expect(err.httpStatus).toBe(502);
    expect(time.waits.every((w) => w <= DEFAULTS.maxWaitMs)).toBe(true);
  });

  it("names network failures and timeouts", async () => {
    const time = fakeTime();
    const reset = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    const { fetchFn } = scripted([reset, reset, reset, reset]);
    setTransportForTests({ fetch: fetchFn, ...time });
    const err = (await politeJson("https://query.wikidata.org/sparql", { source: "Wikidata" }).catch((e: unknown) => e)) as DataSourceError;
    expect(err).toMatchObject({ source: "Wikidata", kind: "unreachable" });
    expect(err.detail).toContain("ECONNRESET");
    expect(err.userMessage).toBe("Couldn't reach Wikidata. Try again in a minute, or open a saved tour.");

    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const second = scripted([timeout, timeout, timeout, timeout]);
    setTransportForTests({ fetch: second.fetchFn, ...fakeTime() });
    await expect(politeJson("https://query.wikidata.org/sparql", { source: "Wikidata" })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("does not retry a 400", async () => {
    const { fetchFn } = scripted([status(400), ok({})]);
    setTransportForTests({ fetch: fetchFn, ...fakeTime() });
    await expect(politeJson("https://query.wikidata.org/sparql", { source: "Wikidata" })).rejects.toMatchObject({ kind: "bad-response", status: 400 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("DISABLE_WIKIDATA=1 fails every Wikidata call as unreachable without a request", async () => {
    vi.stubEnv("DISABLE_WIKIDATA", "1");
    const { fetchFn } = scripted([ok({})]);
    setTransportForTests({ fetch: fetchFn, ...fakeTime() });
    await expect(politeJson("https://query.wikidata.org/sparql", { source: "Wikidata" })).rejects.toMatchObject({
      source: "Wikidata",
      kind: "unreachable",
    });
    expect(fetchFn).not.toHaveBeenCalled();
    // Other sources are unaffected.
    await expect(politeJson("https://en.wikipedia.org/w/api.php", { source: "Wikipedia" })).resolves.toEqual({});
  });

  it("sends requests to one host one at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFn = (async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
      return ok({});
    }) as unknown as typeof fetch;
    setTransportForTests({ fetch: fetchFn });
    await Promise.all([1, 2, 3].map((i) => politeJson(`https://query.wikidata.org/sparql?${i}`, { source: "Wikidata", spacingMs: 0 })));
    expect(maxInFlight).toBe(1);
  });

  it("parses Retry-After as seconds or an HTTP date", () => {
    expect(parseRetryAfter("46", 0)).toBe(46);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });
});

describe("page requests never sit out a rate limit (REQUEST_PATH)", () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it("a 429 with Retry-After: 20 fails fast in real time, for Wikipedia batches and Wikidata queries alike", async () => {
    for (const call of [() => fetchExtracts(["Margaret Mitchell"]), () => sparql("SELECT * WHERE {}")]) {
      setTransportForTests(null);
      const { fetchFn } = scripted([status(429, { "retry-after": "20" }), ok({ never: true })]);
      setTransportForTests({ fetch: fetchFn }); // real clock and real sleep
      const started = Date.now();
      const err = await call().catch((e: unknown) => e);
      expect(Date.now() - started).toBeLessThan(3_000);
      expect(err).toMatchObject({ kind: "rate-limited", status: 429, retryAfterSeconds: 20 });
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  });

  it("then fails fast for the rest of that window instead of waiting it out", async () => {
    const time = fakeTime();
    const { fetchFn } = scripted([status(429, { "retry-after": "20" })]);
    setTransportForTests({ fetch: fetchFn, ...time });
    await fetchExtracts(["A"]).catch(() => {});
    const second = await fetchExtracts(["B"]).catch((e: unknown) => e);
    expect(second).toMatchObject({ kind: "rate-limited" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sum(time.waits.filter((w) => w > 200))).toBe(0); // only spacing, no Retry-After waits
  });

  it("still rides out a short Retry-After, but never more than 2 s of retry waits in all", async () => {
    const short = fakeTime();
    const first = scripted([status(429, { "retry-after": "1" }), ok({ n: 1 })]);
    setTransportForTests({ fetch: first.fetchFn, ...short });
    await expect(politeJson("https://en.wikipedia.org/w/api.php", { source: "Wikipedia", ...REQUEST_PATH })).resolves.toEqual({ n: 1 });
    expect(short.waits).toContain(1000);

    const many = fakeTime();
    const second = scripted([status(429, { "retry-after": "1" }), status(429, { "retry-after": "1" }), status(429, { "retry-after": "1" }), ok({})]);
    setTransportForTests({ fetch: second.fetchFn, ...many });
    await expect(politeJson("https://en.wikipedia.org/w/api.php", { source: "Wikipedia", ...REQUEST_PATH })).rejects.toMatchObject({ kind: "rate-limited" });
    expect(second.fetchFn).toHaveBeenCalledTimes(3);
    expect(sum(many.waits.filter((w) => w >= 1000))).toBeLessThanOrEqual(REQUEST_PATH.maxTotalWaitMs);

    const flaky = fakeTime();
    const third = scripted([status(502), status(502), status(502), ok({})]);
    setTransportForTests({ fetch: third.fetchFn, ...flaky });
    await expect(politeJson("https://query.wikidata.org/sparql", { source: "Wikidata", ...REQUEST_PATH })).rejects.toMatchObject({ status: 502 });
    expect(sum(flaky.waits.filter((w) => w >= 1000))).toBeLessThanOrEqual(REQUEST_PATH.maxTotalWaitMs);
  });

  it("the generic default (used by fixture recording) still waits up to 20 s for a single retry", () => {
    expect(DEFAULTS.maxWaitMs).toBe(20_000);
    expect(REQUEST_PATH).toEqual({ maxWaitMs: 2_000, maxTotalWaitMs: 2_000 });
  });
});

describe("asDataSourceError", () => {
  it("recovers source and kind from a plain Error that crossed a cache boundary", () => {
    const original = new DataSourceError("Wikipedia", "rate-limited", "en.wikipedia.org asked us to wait 46 s.", { status: 429, retryAfterSeconds: 46 });
    const plain = new Error(original.message);
    const back = asDataSourceError(plain, "Wikidata");
    expect(back).toMatchObject({ source: "Wikipedia", kind: "rate-limited", status: 429, retryAfterSeconds: 46 });
    expect(back.detail).toBe("en.wikipedia.org asked us to wait 46 s.");
    expect(back.toBody()).toEqual({
      error: { source: "Wikipedia", message: "Wikipedia asked us to slow down. Try again in a minute, or open a saved tour." },
    });
  });

  it("falls back to 'unreachable' for the given source", () => {
    expect(asDataSourceError(new Error("boom"), "OpenStreetMap")).toMatchObject({ source: "OpenStreetMap", kind: "unreachable" });
  });

  it("never passes on the production build's hidden-error text (seen on /near when Overpass failed)", () => {
    const redacted = Object.assign(
      new Error(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.",
      ),
      { digest: "1234567" },
    );
    const back = asDataSourceError(redacted, "OpenStreetMap");
    expect(back).toMatchObject({ source: "OpenStreetMap", kind: "unreachable", detail: "the request failed." });
    expect(back.userMessage).toBe("Couldn't reach OpenStreetMap. Try again in a minute, or open a saved tour.");
  });
});
