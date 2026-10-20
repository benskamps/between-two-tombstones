"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listSavedTours, type SavedTourSummary } from "@/components/offline/store";

/** Tours downloaded on this phone. Each opens offline via /cemetery/saved. */
export function SavedToursList({ heading = "Saved on this phone" }: { heading?: string }) {
  const [tours, setTours] = useState<SavedTourSummary[] | null>(null);

  useEffect(() => {
    let live = true;
    listSavedTours().then((t) => {
      if (live) setTours(t);
    });
    return () => {
      live = false;
    };
  }, []);

  if (tours === null) return null;
  return (
    <div className="space-y-2" data-testid="saved-tours">
      <h3 className="font-bold">{heading}</h3>
      {tours.length === 0 ? (
        <p className="text-sm text-muted">No tours downloaded yet. Open a tour and tap &ldquo;Download this tour&rdquo; to keep it for places without a signal.</p>
      ) : (
        <ul className="grid gap-2">
          {tours.map((t) => (
            <li key={t.qid}>
              <Link href={`/cemetery/saved?qid=${t.qid}`} className="tap block rounded-xl border border-border bg-surface p-3">
                <span className="font-display text-lg">{t.name}</span>
                <span className="block text-sm text-muted">
                  {[t.locatedIn, `${t.people} people`, `saved ${new Date(t.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
