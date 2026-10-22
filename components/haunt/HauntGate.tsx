"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cemeteryFromParams, gateState, hauntInputFromUrl, isShareLink, shouldAutoSetHaunt, type HauntInput } from "@/lib/haunt/haunt";
import { getFreshHaunt, setHaunt } from "@/lib/haunt/store";
import { useHaunt } from "@/lib/haunt/useHaunt";
import { useVerifiedCemetery } from "@/lib/haunt/useVerified";
import { asHauntInput } from "@/lib/haunt/verify";
import { GateNeutral, PickHauntFirst, type ToolPath } from "./PickHauntFirst";

/**
 * Tool pages open once you have a haunt (decision 18e). Wrap in <Suspense>:
 * it reads the address, which only the browser knows on a prerendered page.
 *
 * - `share`: parameters that mark a link someone sent (?seance=, ?party=).
 *   Those always open: never gate a share.
 * - A cemetery in the address (?cemetery=Q…) opens too, and becomes the haunt
 *   under a name we know: a sample's (or `known`), else the one our burials
 *   route answers with. Never the link's ?name= (K2: a stranger typed that);
 *   until the lookup answers, there's no haunt and the header names nothing.
 *   `selfVerifies`: the tool loads the cemetery itself and sets the haunt then
 *   (the spirit box), so the gate doesn't ask twice.
 * - Otherwise the haunt decides; without one, the page shows the ways in.
 */
export function HauntGate({
  tool,
  share = [],
  known = [],
  selfVerifies = false,
  children,
}: {
  /** The tool's own path: picks the gate's copy and where "Continue to …" goes back to. */
  tool: ToolPath;
  share?: string[];
  known?: HauntInput[];
  selfVerifies?: boolean;
  children: ReactNode;
}) {
  const params = useSearchParams();
  const haunt = useHaunt();
  const get = (k: string) => params.get(k);
  const url = cemeteryFromParams(get);
  const state = gateState({ shareLink: isShareLink(get, share), urlCemetery: url, haunt });

  // Only the address the page opened with sets the haunt, and only when there's
  // no fresh haunt already (F11: a link elsewhere is used, not adopted). A tool
  // that later rewrites its own address (the calendar's picker) is browsing.
  const [opened] = useState(() => ({ qid: url?.qid ?? null, known: url ? hauntInputFromUrl(url, known) : null }));
  useEffect(() => {
    if (opened.known && shouldAutoSetHaunt(opened.known.qid, getFreshHaunt(), null)) setHaunt(opened.known);
  }, [opened]);

  // A cemetery we don't know by name: look it up, then make it the haunt under that name.
  const lookUp = opened.qid !== null && !opened.known && !selfVerifies && haunt !== undefined && shouldAutoSetHaunt(opened.qid, haunt, null);
  const verified = useVerifiedCemetery(lookUp ? opened.qid : null);
  useEffect(() => {
    if (!verified) return;
    const fresh = getFreshHaunt();
    const same = fresh?.qid === verified.qid && fresh.name === verified.name && (fresh.place ?? null) === (verified.place ?? null);
    if (!same && shouldAutoSetHaunt(verified.qid, fresh, null)) setHaunt(asHauntInput(verified));
  }, [verified]);

  if (state === "unknown") return <GateNeutral />;
  if (state === "pick") return <PickHauntFirst tool={tool} />;
  return children;
}
