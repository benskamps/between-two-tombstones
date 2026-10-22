"use client";

import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cemeteryFromParams, type Haunt } from "./haunt";
import { getFreshHaunt, getHaunt, subscribeHaunt } from "./store";

/**
 * The haunt on this phone, if it's fresh (set in the last 12 hours). `undefined`
 * while it can't be known (the server render and the hydration pass), so the
 * first client render matches the HTML exactly; then null (none) or the haunt.
 * Gates, the nav, the header and the tools' defaults all use this one.
 */
export function useHaunt(): Haunt | null | undefined {
  return useSyncExternalStore<Haunt | null | undefined>(subscribeHaunt, getFreshHaunt, () => undefined);
}

/** The stored haunt, fresh or not: for "Last time: … · Back to it". */
export function useLastHaunt(): Haunt | null | undefined {
  return useSyncExternalStore<Haunt | null | undefined>(subscribeHaunt, getHaunt, () => undefined);
}

export type ActiveCemetery = { qid: string; name?: string; place?: string; fromUrl: boolean };

/**
 * The cemetery a tool should use: the one in the address (?cemetery=…) first,
 * else the haunt. Call inside <Suspense> (it reads the search params). A
 * cemetery from the address has a name only when it is also the haunt: the
 * link's own ?name= is never used (K2).
 */
export function useActiveCemetery(): ActiveCemetery | null | undefined {
  const params = useSearchParams();
  const haunt = useHaunt();
  const url = cemeteryFromParams((k) => params.get(k));
  if (url) {
    const same = haunt && haunt.qid === url.qid ? haunt : null;
    return { qid: url.qid, name: same?.name, place: same?.place, fromUrl: true };
  }
  if (haunt === undefined) return undefined;
  return haunt ? { qid: haunt.qid, name: haunt.name, place: haunt.place, fromUrl: false } : null;
}
