// 'use cache: remote' wrappers around the fetchers (decision 8). One week
// ('weeks': revalidate 7 days, expire 30 days). Arguments are already
// normalized by the callers so equal requests share an entry. A thrown error is
// never stored (the default handler drops errored entries), so a failure is
// retried on the next request; lib/data/load.ts adds the named fallbacks.
//
// Locally and on `next start`, 'use cache: remote' uses Next's in-memory LRU
// (no `cacheHandlers` configured); on Vercel the platform provides the remote
// handler.

import { cacheLife, cacheTag } from "next/cache";
import type { Cemetery, WikipediaSummary } from "@/lib/types";
import { fetchOsmCemeteries, type OsmCemetery } from "./overpass";
import type { CemeterySearchResult, NearbyCemetery } from "./types";
import { fetchBurials, fetchCemeteryFacts, fetchNearby, fetchSearch, type PersonRow } from "./wikidata";
import { fetchExtracts } from "./wikipedia";

export async function cachedBurials(qid: string): Promise<{ rows: PersonRow[]; fetchedAt: string }> {
  "use cache: remote";
  cacheLife("weeks");
  cacheTag(`cemetery-${qid}`);
  const rows = await fetchBurials(qid);
  return { rows, fetchedAt: new Date().toISOString() };
}

export async function cachedCemeteryFacts(qid: string): Promise<Cemetery | null> {
  "use cache: remote";
  cacheLife("weeks");
  cacheTag(`cemetery-${qid}`);
  return fetchCemeteryFacts(qid);
}

export async function cachedExtracts(titles: string[]): Promise<Record<string, WikipediaSummary>> {
  "use cache: remote";
  cacheLife("weeks");
  return fetchExtracts(titles);
}

export async function cachedNearby(lat: number, lon: number): Promise<NearbyCemetery[]> {
  "use cache: remote";
  cacheLife("weeks");
  return fetchNearby(lat, lon);
}

export async function cachedSearch(q: string): Promise<CemeterySearchResult[]> {
  "use cache: remote";
  cacheLife("weeks");
  return fetchSearch(q);
}

export async function cachedOsm(lat: number, lon: number, radiusKm: number): Promise<{ mirror: string; cemeteries: OsmCemetery[] }> {
  "use cache: remote";
  cacheLife("weeks");
  return fetchOsmCemeteries(lat, lon, radiusKm);
}
