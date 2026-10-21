"use client";

import { useState, useSyncExternalStore } from "react";
import { partyPath } from "@/lib/games/bingo";
import { RoomCode } from "./RoomCode";

function subscribeNothing() {
  return () => {};
}

function canWebShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function origin() {
  return window.location.origin;
}

/**
 * The room code (as an instrument readout), the link, a copy button and
 * (where the phone has it) a share button. `showCode` is off where the page
 * already shows the code above (the party's own card).
 */
export function PartyShare({ code, showCode = true }: { code: string; showCode?: boolean }) {
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
      {showCode && (
        <div className="instrument bezel space-y-2 px-4 py-3">
          <p className="label text-muted">Room code</p>
          <RoomCode code={code} testId="room-code" />
        </div>
      )}
      <label className="block">
        <span className="text-sm text-muted">Party link</span>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="field mt-1 w-full font-mono text-sm"
          data-testid="party-link"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-ghost">
          Copy link
        </button>
        {shareable && (
          <button type="button" onClick={share} className="btn btn-ghost">
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
