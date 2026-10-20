import { afterEach, describe, expect, it, vi } from "vitest";
import batch from "./__fixtures__/wikipedia-extracts-batch1.json";
import { setTransportForTests } from "./wikimedia";
import { BATCH_SIZE, extractsUrl, fetchExtracts, parseExtracts, titleFromUrl } from "./wikipedia";

afterEach(() => setTransportForTests(null));

describe("Wikipedia extracts", () => {
  it("asks for 20 intro extracts per request, plain text, following redirects", () => {
    const url = new URL(extractsUrl(["Margaret Mitchell", "Bobby Jones (golfer)"]));
    expect(url.host).toBe("en.wikipedia.org");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      action: "query",
      prop: "extracts|info",
      exintro: "1",
      explaintext: "1",
      exlimit: String(BATCH_SIZE),
      redirects: "1",
      titles: "Margaret Mitchell|Bobby Jones (golfer)",
    });
  });

  it("maps every title in the recorded Oakland batch to its summary", () => {
    const out = parseExtracts(batch.titles, batch.response);
    expect(Object.keys(out)).toHaveLength(batch.titles.length);
    const mitchell = out["Margaret Mitchell"];
    expect(mitchell.extract).toMatch(/^Margaret Munnerlyn Mitchell/);
    expect(mitchell.url).toBe("https://en.wikipedia.org/wiki/Margaret_Mitchell");
    expect(typeof mitchell.revision).toBe("number");
  });

  it("follows normalization and redirects back to the requested title", () => {
    const out = parseExtracts(["foo_bar", "Old Name", "Missing"], {
      query: {
        normalized: [{ from: "foo_bar", to: "Foo bar" }],
        redirects: [{ from: "Old Name", to: "New Name" }],
        pages: [
          { title: "Foo bar", extract: "Foo.", fullurl: "https://en.wikipedia.org/wiki/Foo_bar", lastrevid: 1 },
          { title: "New Name", extract: "New.", fullurl: "https://en.wikipedia.org/wiki/New_Name", lastrevid: 2 },
          { title: "Missing", missing: true },
        ],
      },
    });
    expect(out["foo_bar"].title).toBe("Foo bar");
    expect(out["Old Name"].title).toBe("New Name");
    expect(out["Missing"]).toBeUndefined();
  });

  it("batches 45 titles into 3 serial requests", async () => {
    const seen: number[] = [];
    setTransportForTests({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const titles = new URL(String(input)).searchParams.get("titles")!.split("|");
        seen.push(titles.length);
        return new Response(
          JSON.stringify({
            query: { pages: titles.map((t) => ({ title: t, extract: `${t}.`, fullurl: `https://en.wikipedia.org/wiki/${t}` })) },
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    const titles = Array.from({ length: 45 }, (_, i) => `Person ${i}`);
    const out = await fetchExtracts(titles);
    expect(seen).toEqual([20, 20, 5]);
    expect(Object.keys(out)).toHaveLength(45);
  });

  it("turns article URLs into titles", () => {
    expect(titleFromUrl("https://en.wikipedia.org/wiki/Oakland_Cemetery_(Atlanta)")).toBe("Oakland Cemetery (Atlanta)");
    expect(titleFromUrl("https://en.wikipedia.org/wiki/Fran%C3%A7ois_Truffaut")).toBe("François Truffaut");
    expect(titleFromUrl("https://example.com/nothing")).toBeNull();
  });

  it("names an API error as a Wikipedia bad response", () => {
    expect(() => parseExtracts(["x"], { error: { code: "maxlag", info: "Waiting" } })).toThrow(/maxlag/);
  });
});
