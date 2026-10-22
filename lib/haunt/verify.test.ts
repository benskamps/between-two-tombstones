import { afterEach, describe, expect, it } from "vitest";
import { fetchVerified, getVerified, readVerified, requestVerified, resetVerified } from "./verify";

// K2: a haunt set from a link takes its name from our burials route, never from ?name=.

function fakeFetch(status: number, body: unknown, calls: string[] = []): typeof fetch {
  return (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const lakeView = { cemetery: { qid: "Q872253", name: "Lake View Cemetery", locatedIn: "Seattle" }, people: [] };

describe("readVerified", () => {
  it("keeps the cemetery's own name and place", () => {
    expect(readVerified("Q872253", lakeView)).toEqual({ qid: "Q872253", name: "Lake View Cemetery", place: "Seattle" });
    expect(readVerified("Q872253", { cemetery: { qid: "Q872253", name: "Lake View Cemetery", locatedIn: null } })).toEqual({
      qid: "Q872253",
      name: "Lake View Cemetery",
    });
  });

  it("refuses an ID for a name, another cemetery's answer, and anything that isn't one", () => {
    expect(readVerified("Q872253", { cemetery: { qid: "Q872253", name: "Q872253" } })).toBeNull();
    expect(readVerified("Q872253", { cemetery: { qid: "Q1", name: "Elsewhere" } })).toBeNull();
    expect(readVerified("Q872253", { error: { source: "Wikidata", message: "down" } })).toBeNull();
    expect(readVerified("Q872253", null)).toBeNull();
    expect(readVerified("Q872253", { cemetery: { qid: "Q872253", name: "x".repeat(500) } })!.name).toHaveLength(120);
  });
});

describe("fetchVerified", () => {
  it("asks our burials route, by ID only", async () => {
    const calls: string[] = [];
    expect(await fetchVerified("Q872253", { fetchImpl: fakeFetch(200, lakeView, calls) })).toMatchObject({ name: "Lake View Cemetery" });
    expect(calls).toEqual(["/api/cemeteries/Q872253/burials"]);
  });

  it("gives null on an outage, a bad ID or a timeout", async () => {
    expect(await fetchVerified("Q872253", { fetchImpl: fakeFetch(503, { error: { source: "Wikidata", message: "x" } }) })).toBeNull();
    const calls: string[] = [];
    expect(await fetchVerified("../../etc", { fetchImpl: fakeFetch(200, lakeView, calls) })).toBeNull();
    expect(calls).toEqual([]);
    const never = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    expect(await fetchVerified("Q872253", { fetchImpl: never, timeoutMs: 20 })).toBeNull();
  });
});

describe("one lookup per cemetery", () => {
  afterEach(resetVerified);

  it("shares the answer and asks once", async () => {
    const calls: string[] = [];
    const f = fakeFetch(200, lakeView, calls);
    requestVerified("Q872253", f);
    requestVerified("Q872253", f);
    expect(getVerified("Q872253")).toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(getVerified("Q872253")).toMatchObject({ name: "Lake View Cemetery" });
    expect(calls).toHaveLength(1);
  });

  it("remembers a failure as null for the page view", async () => {
    requestVerified("Q999999", fakeFetch(503, {}));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(getVerified("Q999999")).toBeNull();
  });
});
