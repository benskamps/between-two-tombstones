"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SavedToursList } from "@/components/tour/SavedToursList";
import { TourView } from "@/components/tour/TourView";

const QID_RE = /^Q[1-9]\d{0,11}$/;

const noop = () => () => {};

/**
 * The offline shell at /cemetery/saved?qid=…: a static page the service worker
 * keeps, which renders a downloaded tour straight from IndexedDB. Without a
 * qid it lists every tour saved on this phone.
 */
export function SavedTourPage() {
  const search = useSyncExternalStore(noop, () => location.search, () => null);
  if (search === null) return <p className="text-muted">Opening saved tours…</p>;
  const qid = new URLSearchParams(search).get("qid")?.toUpperCase() ?? "";

  if (!QID_RE.test(qid)) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl">Saved tours</h1>
        <SavedToursList heading="Tours on this phone" />
      </div>
    );
  }

  return (
    <TourView
      qid={qid}
      initial={null}
      error={null}
      fallback={
        <div role="alert" className="space-y-4">
          <h1 className="font-display text-3xl">This tour isn&rsquo;t saved on this phone</h1>
          <p>
            Open it while you have a signal and tap &ldquo;Download this tour&rdquo;.{" "}
            <Link href={`/cemetery/${qid}`} className="underline">
              Open it now
            </Link>
          </p>
          <SavedToursList heading="Tours on this phone" />
        </div>
      }
    />
  );
}
