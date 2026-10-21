// Re-records the fixtures the unit tests replay. Skipped unless asked:
//   RECORD_FIXTURES=1 NODE_USE_ENV_PROXY=1 pnpm vitest run lib/data/fixtures.record.test.ts
// Only fixtures missing from __fixtures__/ are fetched (delete one to refresh
// it), serially, through the same polite client the app uses.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { politeJson, setTransportForTests } from "./wikimedia";
import { burialsQuery, cemeteryFactsQuery, nearQuery, searchQuery, sparql } from "./wikidata";
import { extractsUrl, titleFromUrl } from "./wikipedia";

const DIR = join(__dirname, "__fixtures__");
const record = process.env.RECORD_FIXTURES === "1";
const have = (name: string) => existsSync(join(DIR, `${name}.json`));

function save(name: string, data: unknown) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${name}.json`), JSON.stringify(data, null, 1) + "\n");
}

async function rawSparql(name: string, query: string) {
  if (have(name)) return;
  let raw: unknown;
  setTransportForTests({
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      const text = await res.text();
      raw = JSON.parse(text);
      return new Response(text, { status: res.status, headers: res.headers });
    },
  });
  await sparql(query);
  save(name, raw);
}

describe.skipIf(!record)("record live fixtures", () => {
  afterAll(() => setTransportForTests(null));

  it("records missing Wikidata + Wikipedia responses", async () => {
    await rawSparql("sparql-burials-Q2008469", burialsQuery("Q2008469"));
    await rawSparql("sparql-facts-Q2008469", cemeteryFactsQuery("Q2008469"));
    await rawSparql("sparql-near-lakeview", nearQuery(47.6339, -122.3158));
    await rawSparql("sparql-search-lake-view-cemetery", searchQuery("lake view cemetery"));
    await rawSparql("sparql-search-oakland", searchQuery("oakland"));
    await rawSparql("sparql-search-oakland-cemetery", searchQuery("oakland cemetery"));
    await rawSparql("sparql-near-manhattan", nearQuery(40.758, -73.9855));
    // The review's two Gate 2 points (F2), rounded as lib/data/load.ts rounds them.
    await rawSparql("sparql-near-charleston", nearQuery(32.804, -79.947));
    await rawSparql("sparql-near-oakland", nearQuery(33.749, -84.372));
    setTransportForTests(null);

    if (!have("wikipedia-extracts-batch1")) {
      const burials = JSON.parse(readFileSync(join(DIR, "sparql-burials-Q2008469.json"), "utf8"));
      const rows = (burials as { results: { bindings: { enwiki?: { value: string } }[] } }).results.bindings;
      const titles = rows.flatMap((r) => (r.enwiki ? [titleFromUrl(r.enwiki.value)!] : [])).slice(0, 20);
      const json = await politeJson(extractsUrl(titles), { source: "Wikipedia" });
      save("wikipedia-extracts-batch1", { titles, response: json });
    }
    expect(have("sparql-burials-Q2008469")).toBe(true);
  }, 180_000);
});
