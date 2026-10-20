// The cached deck, one entry per rounded point and radius (PLAN.md decision 8:
// stateless, Wikimedia results cached with 'use cache: remote').
//
// A full deck stays fresh for a day (`days`: revalidated in the background
// after 1 day, dropped after a week unused). A deck with a note (Wikipedia
// rate-limited us, or the burials query failed) is kept for minutes, so the
// missing parts fill in soon. A failed profiles query throws, and thrown
// results are never stored.

import { cacheLife } from "next/cache";
import { buildDeck } from "./deck";
import type { Deck } from "./types";
import { liveFetcher } from "./wikimedia";

/** Two decimals ≈ 1.1 km: close neighbors share one cache entry. */
export function roundPoint(lat: number, lon: number): { lat: number; lon: number } {
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}

export async function getDeck(lat: number, lon: number, radiusKm: number): Promise<Deck> {
  "use cache: remote";
  const deck = await buildDeck({ lat, lon }, radiusKm, liveFetcher());
  if (deck.notes.length > 0) {
    cacheLife("minutes");
  } else {
    cacheLife("days");
  }
  return deck;
}
