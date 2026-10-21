// The burials query gets its own longer timeout; every other Wikidata call keeps the default.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as { url: string; opts: Record<string, unknown> }[]);
vi.mock("./wikimedia", async (importOriginal) => {
  const real = await importOriginal<typeof import("./wikimedia")>();
  return {
    ...real,
    politeJson: vi.fn(async (url: string, opts: Record<string, unknown>) => {
      calls.push({ url, opts });
      return { results: { bindings: [] } };
    }),
  };
});

const { BURIALS_FETCH, fetchBurials, fetchCemeteryFacts, fetchNearby, fetchSearchOnce } = await import("./wikidata");
const { REQUEST_PATH, DEFAULTS } = await import("./wikimedia");

beforeEach(() => {
  calls.length = 0;
});

describe("timeouts per Wikidata call", () => {
  it("the burials query waits up to 25 s, once, and keeps the 2 s cap on rate-limit waits", async () => {
    await fetchBurials("Q216344");
    expect(calls).toHaveLength(1);
    expect(calls[0].opts).toMatchObject({ source: "Wikidata", timeoutMs: 25_000, deadlineMs: 26_000, ...REQUEST_PATH });
    expect(BURIALS_FETCH.timeoutMs).toBeGreaterThan(DEFAULTS.timeoutMs);
    // No room for a second attempt after a timeout: the deadline is within one backoff (1 s) of it.
    expect(BURIALS_FETCH.deadlineMs - BURIALS_FETCH.timeoutMs).toBeLessThanOrEqual(1_000);
  });

  it("facts, near and search keep the default per-attempt timeout", async () => {
    await fetchCemeteryFacts("Q216344");
    await fetchNearby(38.88, -77.07);
    await fetchSearchOnce("arlington");
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.opts.timeoutMs).toBeUndefined();
      expect(c.opts).toMatchObject(REQUEST_PATH);
    }
  });
});
