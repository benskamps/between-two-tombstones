"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SavedToursList } from "@/components/tour/SavedToursList";
import { TourView } from "@/components/tour/TourView";
import { PageHeader } from "@/components/ui/Motifs";
import { Sprout } from "@/components/ui/symbols";

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
        <PageHeader title="Saved tours" tool="saved" life={<Sprout className="h-5 w-5" />} />
        <SavedToursList heading="Tours on this phone" level={2} />
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
          <PageHeader
            title="This tour isn’t saved on this phone"
            intro="Open it while you have a signal and tap “Download this tour”."
            tool="saved"
            life={<Sprout className="h-5 w-5" />}
          />
          <Link href={`/cemetery/${qid}`} className="btn btn-primary">
            Open it now
          </Link>
          <SavedToursList heading="Tours on this phone" level={2} />
        </div>
      }
    />
  );
}
