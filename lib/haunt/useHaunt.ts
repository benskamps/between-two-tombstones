"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { cemeteryFromParams, type Haunt, type HauntInput, type UrlCemetery } from "./haunt";
import { getHaunt, setHaunt, subscribeHaunt } from "./store";

/**
 * The haunt on this phone. `undefined` while it can't be known (the server
 * render and the hydration pass), so the first client render matches the HTML
 * exactly; then null (none) or the haunt.
 */
export function useHaunt(): Haunt | null | undefined {
  return useSyncExternalStore<Haunt | null | undefined>(subscribeHaunt, getHaunt, () => undefined);
}

/**
 * Makes this cemetery the haunt once it's known (the cemetery page calls this
 * with the tour it loaded). Re-runs only when the cemetery changes.
 */
export function useSetHaunt(input: HauntInput | null): void {
  const qid = input?.qid;
  const name = input?.name;
  const place = input?.place ?? undefined;
  useEffect(() => {
    if (qid && name) setHaunt({ qid, name, place });
  }, [qid, name, place]);
}

/**
 * The cemetery a tool should use: the one in the address (?cemetery=…) first,
 * else the haunt. Call inside <Suspense> (it reads the search params).
 */
export function useActiveCemetery(): (UrlCemetery & { fromUrl: boolean }) | null | undefined {
  const params = useSearchParams();
  const haunt = useHaunt();
  const url = cemeteryFromParams((k) => params.get(k));
  if (url) {
    const same = haunt && haunt.qid === url.qid ? haunt : null;
    return { qid: url.qid, name: url.name ?? same?.name, place: url.place ?? same?.place, fromUrl: true };
  }
  if (haunt === undefined) return undefined;
  return haunt ? { qid: haunt.qid, name: haunt.name, place: haunt.place, fromUrl: false } : null;
}
