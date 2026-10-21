"use client";

import Link from "next/link";
import { useEffect } from "react";
import { shareEvent } from "@/lib/share/analytics";
import type { ShareKind } from "@/lib/share/links";

/** The share page's one call to action: the primary pill, counted as the funnel's last step. */
export function ShareCta({ kind, href, label }: { kind: ShareKind; href: string; label: string }) {
  return (
    <Link href={href} onClick={() => shareEvent("tour_started_from_share", kind)} className="btn btn-primary btn-lg w-full" data-testid="share-cta">
      {label}
    </Link>
  );
}

/** Counts one view of a share page (only browsers run it, so link-preview bots don't count). */
export function ShareViewed({ kind }: { kind: ShareKind }) {
  useEffect(() => {
    shareEvent("share_viewed", kind);
  }, [kind]);
  return null;
}
