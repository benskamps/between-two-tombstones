// Tiny polite Wikidata/Wikipedia/Overpass client for scripts (not app code).
// Serial requests, 1.1 s spacing, capped retries on 429/5xx honoring Retry-After.
export const UA =
  "BetweenTwoTombstones/0.1 (https://github.com/benskamps/between-two-tombstones)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

export async function politeFetch(url, init = {}, { maxRetries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res;
    try {
      res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      console.error(`  network error on ${new URL(url).host} (${err.cause?.code ?? err.message}), retry ${attempt + 1}`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const ra = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt;
      console.error(`  ${res.status} on ${new URL(url).host}, retry ${attempt + 1} in ${backoff}ms`);
      await sleep(Math.min(backoff, 30000));
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
  }
}

export async function sparql(query) {
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
  const res = await politeFetch(url, { headers: { Accept: "application/sparql-results+json" } });
  const json = await res.json();
  return json.results.bindings.map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])),
  );
}
