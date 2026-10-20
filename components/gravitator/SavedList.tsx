"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { tourHref } from "@/lib/gravitator/format";
import { getSaved, getSavedServer, removeSaved, subscribeSaved, type SavedGraveyard } from "@/lib/gravitator/saved";
import { PlaceholderArt } from "./PlaceholderArt";

function Thumb({ g }: { g: SavedGraveyard }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-(--g-surface-2)">
      {g.image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={g.image} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <PlaceholderArt qid={g.qid} className="h-full w-full" />
      )}
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function SavedList() {
  const saved = useSyncExternalStore(subscribeSaved, getSaved, getSavedServer);
  const [announcement, setAnnouncement] = useState("");

  if (saved === null) {
    return <p className="text-(--g-muted)">Opening your graveyards…</p>;
  }

  return (
    <div>
      {saved.length === 0 ? (
        <div className="space-y-4 rounded-3xl border border-(--g-border) bg-(--g-surface) p-6">
          <p className="font-display text-2xl leading-snug">Nothing saved yet.</p>
          <p className="text-(--g-muted)">Swipe right on a cemetery and it waits for you here.</p>
          <Link href="/gravitator" className="g-btn g-btn-mauve w-full">
            Start swiping
          </Link>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Saved cemeteries">
          {saved.map((g) => (
            <li key={g.qid} className="rounded-3xl border border-(--g-border) bg-(--g-surface) p-4" data-qid={g.qid}>
              <div className="flex items-center gap-4">
                <Thumb g={g} />
                <div className="min-w-0">
                  <h2 className="font-display text-2xl leading-tight break-words">{g.name}</h2>
                  <p className="text-sm text-(--g-muted)">
                    {g.place ? `${g.place} · ` : ""}saved {DATE.format(new Date(g.savedAt))}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Link href={tourHref(g.qid)} prefetch={false} className="g-btn g-btn-candle">
                  Go now
                </Link>
                <button
                  type="button"
                  className="g-btn g-btn-ghost"
                  aria-label={`Remove ${g.name}`}
                  onClick={() => {
                    removeSaved(g.qid);
                    setAnnouncement(`Removed ${g.name}.`);
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
