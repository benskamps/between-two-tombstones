// Wikipedia intro extracts, 20 titles per request (decision 10). The per-page
// REST summary endpoint gets rate-limited fast from shared IPs; the Action API
// batch fetched 80 summaries in 4 requests in Hour 0. Ported from
// scripts/snapshot.mjs, including the redirect/normalization mapping.

import { cleanExtract } from "@/lib/tour/text";
import type { WikipediaSummary } from "@/lib/types";
import { DataSourceError } from "./errors";
import { politeJson } from "./wikimedia";

export const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
export const BATCH_SIZE = 20;
/** Cap: one cemetery never costs more than this many Wikipedia requests. */
export const MAX_TITLES = 100;

type QueryJson = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; invalid?: boolean; extract?: string; fullurl?: string; lastrevid?: number }[];
  };
  error?: { code: string; info: string };
};

/** "https://en.wikipedia.org/wiki/Oakland_Cemetery_(Atlanta)" → "Oakland Cemetery (Atlanta)". */
export function titleFromUrl(url: string): string | null {
  const part = url.split("/wiki/")[1];
  if (!part) return null;
  try {
    return decodeURIComponent(part).replaceAll("_", " ");
  } catch {
    return part.replaceAll("_", " ");
  }
}

export function extractsUrl(titles: string[]): string {
  return `${WIKIPEDIA_API}?${new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    exlimit: String(BATCH_SIZE),
    inprop: "url",
    titles: titles.join("|"),
  })}`;
}

/** Map each requested title to its page, following normalization and redirects. Extracts come back cleaned (lib/tour/text). */
export function parseExtracts(requested: string[], json: QueryJson): Record<string, WikipediaSummary> {
  if (json.error) {
    throw new DataSourceError("Wikipedia", "bad-response", `Wikipedia API error: ${json.error.code} ${json.error.info}`);
  }
  const q = json.query;
  if (!q || !Array.isArray(q.pages)) {
    throw new DataSourceError("Wikipedia", "bad-response", "Wikipedia answered without pages.");
  }
  const alias = new Map<string, string>();
  for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) alias.set(n.from, n.to);
  const byTitle = new Map(q.pages.filter((p) => !p.missing && !p.invalid).map((p) => [p.title, p]));
  const out: Record<string, WikipediaSummary> = {};
  for (const t of requested) {
    let k = t;
    for (let hops = 0; alias.has(k) && hops < 3; hops++) k = alias.get(k)!;
    const p = byTitle.get(k);
    const extract = p?.extract ? cleanExtract(p.extract) : "";
    if (p && extract && p.fullurl) {
      out[t] = { title: p.title, extract, url: p.fullurl, revision: p.lastrevid };
    }
  }
  return out;
}

/** Intro extracts for up to MAX_TITLES titles, keyed by the requested title. */
export async function fetchExtracts(titles: string[]): Promise<Record<string, WikipediaSummary>> {
  const unique = [...new Set(titles)].slice(0, MAX_TITLES);
  const out: Record<string, WikipediaSummary> = {};
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const json = await politeJson<QueryJson>(extractsUrl(batch), { source: "Wikipedia" });
    Object.assign(out, parseExtracts(batch, json));
  }
  return out;
}
