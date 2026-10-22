"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cemeteryQuery, shouldAutoSetHaunt, type Haunt, NEXT_TOOLS } from "@/lib/haunt/haunt";
import { readNext } from "@/lib/haunt/next";
import { setHaunt } from "@/lib/haunt/store";
import { useHaunt } from "@/lib/haunt/useHaunt";
import { urlCoord } from "@/lib/data/near";

const noSubscribe = () => () => {};
const DECIMAL = /^-?\d{1,3}(\.\d+)?$/;

export type Hub = {
  /** This cemetery is the (fresh) haunt. */
  isHaunt: boolean;
  /** A different fresh haunt that this page didn't replace (F11): offer "Make this my haunt". */
  other: Haunt | null;
  makeHaunt: () => void;
  /** Reached from "I'm here" (via=here): where to see the other cemeteries nearby. */
  notHereHref: string | null;
  /** A tool that asked for a haunt first (F12), once this is the haunt. */
  continueTo: { href: string; label: string } | null;
};

/**
 * The cemetery page as the haunt's hub. Opening it makes it the haunt when the
 * visitor came from "I'm here" or the near list (?via=here|near), when there's
 * no fresh haunt, or when it already is the haunt (that refreshes it).
 * Otherwise it offers to switch instead of switching on its own (F11).
 */
export function useHub(cemetery: { qid: string; name: string; locatedIn: string | null } | null): Hub {
  // The address and the haunt are only known in the browser.
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => null);
  const next = useSyncExternalStore(noSubscribe, () => readNext(), () => null);
  const fresh = useHaunt();
  const params = new URLSearchParams(search ?? "");
  const via = params.get("via");
  const known = search !== null && fresh !== undefined;
  const qid = cemetery?.qid ?? "";
  const name = cemetery?.name ?? "";
  const place = cemetery?.locatedIn ?? undefined;
  const auto = known && cemetery !== null && shouldAutoSetHaunt(qid, fresh ?? null, via);

  useEffect(() => {
    if (auto) setHaunt({ qid, name, place });
  }, [auto, qid, name, place]);

  const isHaunt = cemetery !== null && fresh?.qid === qid;
  const lat = params.get("lat") ?? "";
  const lon = params.get("lon") ?? "";
  // Three decimals, like every link with a position in it (an older hub link may carry more).
  const notHereHref =
    via === "here" && DECIMAL.test(lat) && DECIMAL.test(lon)
      ? `/near?${new URLSearchParams({ lat: urlCoord(Number(lat)), lon: urlCoord(Number(lon)), list: "1" })}`
      : null;
  const continueTo =
    isHaunt && next && cemetery ? { href: `${next}?${cemeteryQuery({ qid, name, place })}`, label: `Continue to ${NEXT_TOOLS[next]}` } : null;

  return {
    isHaunt,
    other: known && !auto && fresh && fresh.qid !== qid ? fresh : null,
    makeHaunt: () => setHaunt({ qid, name, place }),
    notHereHref,
    continueTo,
  };
}
