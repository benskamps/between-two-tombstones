"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { cemeteryFromParams, gateState, hauntInputFromUrl, isShareLink, type HauntInput } from "@/lib/haunt/haunt";
import { setHaunt } from "@/lib/haunt/store";
import { useHaunt } from "@/lib/haunt/useHaunt";
import { GateNeutral, PickHauntFirst } from "./PickHauntFirst";

/**
 * Tool pages open once you have a haunt (decision 18e). Wrap in <Suspense>:
 * it reads the address, which only the browser knows on a prerendered page.
 *
 * - `share`: parameters that mark a link someone sent (?seance=, ?party=).
 *   Those always open: never gate a share.
 * - A cemetery in the address (?cemetery=Q…) opens too, and becomes the haunt
 *   when its name is known (from ?name= or `known`, e.g. the sample cemeteries).
 * - Otherwise the haunt decides; without one, the page shows the ways in.
 */
export function HauntGate({
  tool,
  share = [],
  known = [],
  children,
}: {
  tool: string;
  share?: string[];
  known?: HauntInput[];
  children: ReactNode;
}) {
  const params = useSearchParams();
  const haunt = useHaunt();
  const get = (k: string) => params.get(k);
  const url = cemeteryFromParams(get);
  const toSet = url ? hauntInputFromUrl(url, known) : null;
  const state = gateState({ shareLink: isShareLink(get, share), urlCemetery: url, haunt });

  // Only the address the page opened with sets the haunt: a tool that later
  // rewrites its own address (the calendar's picker) is browsing, not moving.
  const opened = useRef(toSet);
  useEffect(() => {
    const first = opened.current;
    if (first) setHaunt(first);
  }, []);

  if (state === "unknown") return <GateNeutral />;
  if (state === "pick") return <PickHauntFirst tool={tool} />;
  return children;
}
