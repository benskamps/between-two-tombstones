"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { matchLine, tourHref } from "@/lib/gravitator/format";
import type { GraveyardProfile } from "@/lib/gravitator/types";
import { CardPhoto } from "./ProfileCard";

/** Shown after every save. Native <dialog>: focus stays inside, Esc keeps swiping. */
export function MatchDialog({
  card,
  km,
  onClose,
}: {
  card: GraveyardProfile;
  km: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // Default to the safe choice so Enter doesn't leave the deck by accident.
    keepRef.current?.focus();
    return () => {
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="g-match"
      aria-labelledby="g-match-title"
      aria-describedby="g-match-line"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="g-wisps" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="relative">
        <div className="g-match-portrait">
          <CardPhoto card={card} eager />
        </div>
        <h2 id="g-match-title" className="font-display text-4xl leading-tight">
          It&rsquo;s a match.
        </h2>
        <p className="mt-1 font-display text-2xl">{card.name}</p>
        <p id="g-match-line" className="mt-2 text-(--g-muted)">
          {matchLine(card.name, km)}
        </p>
        <div className="mt-6 grid gap-3">
          <Link href={tourHref(card.qid)} prefetch={false} className="g-btn g-btn-candle w-full">
            Start a tour here
          </Link>
          <button ref={keepRef} type="button" className="g-btn g-btn-ghost w-full" onClick={onClose}>
            Keep swiping
          </button>
        </div>
        <p className="mt-4 text-sm text-(--g-muted)">
          Saved to <Link href="/gravitator/saved">Your graveyards</Link> on this phone.
        </p>
      </div>
    </dialog>
  );
}
