// Server side of a share page: the same loader the tour uses (lib/data/load.ts,
// whose fetchers are cached with 'use cache: remote' for a week), so a shared
// link costs what opening the tour costs, and a link made from a tour finds its
// data already cached. React's cache() shares one load between the page and
// its metadata in a request.

import { cache } from "react";
import { loadCemetery } from "@/lib/data/load";
import type { DataSource } from "@/lib/data/errors";
import { isBlocked } from "./blocked";
import type { ShareRef } from "./links";
import { roomCard, stopCard, tourCard, type ShareCard } from "./model";

export type ShareLoad =
  | { status: "ok"; card: ShareCard }
  /** Malformed, taken down, or Wikidata doesn't list that person at that cemetery. */
  | { status: "not-found" }
  /** The data source failed: the page names it and still offers the way on. */
  | { status: "error"; source: DataSource; message: string; card: ShareCard | null };

async function load(ref: ShareRef, now: Date): Promise<ShareLoad> {
  if (isBlocked(ref.cemetery, ref.kind === "stop" ? ref.person : null)) return { status: "not-found" };
  const result = await loadCemetery(ref.cemetery);

  if (ref.kind === "seance" || ref.kind === "party") {
    // A room always works (the code makes the séance or the card); the cemetery is named only when we can.
    if (result.status === "ok") return { status: "ok", card: roomCard(ref.kind, ref.room, result.data.cemetery, result.data.people) };
    if (result.status === "not-found") return { status: "ok", card: roomCard(ref.kind, ref.room, null, []) };
    return {
      status: "error",
      source: result.error.source,
      message: result.error.userMessage,
      card: roomCard(ref.kind, ref.room, null, []),
    };
  }

  if (result.status === "not-found") return { status: "not-found" };
  if (result.status === "error") return { status: "error", source: result.error.source, message: result.error.userMessage, card: null };
  const { cemetery, people } = result.data;
  const card = ref.kind === "stop" ? stopCard(cemetery, people, ref.person, now) : tourCard(cemetery, people, now);
  return card ? { status: "ok", card } : { status: "not-found" };
}

/** One load per share link per request (the page and its metadata ask with equal refs). */
const loadByKey = cache(async (key: string): Promise<ShareLoad> => load(JSON.parse(key) as ShareRef, new Date()));

export function loadShare(ref: ShareRef): Promise<ShareLoad> {
  return loadByKey(JSON.stringify(ref));
}
