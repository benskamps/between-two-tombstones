"use client";

import { useState, useSyncExternalStore } from "react";
import { partyPath } from "@/lib/games/bingo";

function subscribeNothing() {
  return () => {};
}

function canWebShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function origin() {
  return window.location.origin;
}

/** The room code, the link, a copy button and (where the phone has it) a share button. */
export function PartyShare({ code }: { code: string }) {
  const base = useSyncExternalStore(subscribeNothing, origin, () => "");
  const shareable = useSyncExternalStore(subscribeNothing, canWebShare, () => false);
  const [note, setNote] = useState<string | null>(null);
  const link = `${base}${partyPath(code)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setNote("Link copied.");
    } catch {
      setNote("Couldn’t copy. Press and hold the link above to copy it.");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Tombstone Bingo party",
        text: `Join my Tombstone Bingo party. Room code ${code}.`,
        url: link,
      });
      setNote(null);
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") setNote("Couldn’t open sharing. Copy the link instead.");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted">Room code</p>
        <p className="font-mono text-4xl font-bold tracking-[0.3em]" data-testid="room-code">
          {code}
        </p>
      </div>
      <label className="block">
        <span className="text-sm text-muted">Party link</span>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="tap mt-1 w-full rounded-lg border border-border bg-bg px-3 font-mono text-sm"
          data-testid="party-link"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="tap rounded-lg border border-border px-4 font-bold">
          Copy link
        </button>
        {shareable && (
          <button type="button" onClick={share} className="tap rounded-lg border border-border px-4 font-bold">
            Share
          </button>
        )}
      </div>
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
    </div>
  );
}
