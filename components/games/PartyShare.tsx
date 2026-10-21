"use client";

import { useState, useSyncExternalStore } from "react";
import { partyPath } from "@/lib/games/bingo";
import { useActiveCemetery } from "@/lib/haunt/useHaunt";
import { shareEvent } from "@/lib/share/analytics";
import { sharePath } from "@/lib/share/links";
import { SplitFlap } from "@/components/ui/Instrument";

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
 *
 * The link is the party's share page (/s/party/<cemetery>/<code>) when the
 * cemetery is known (the haunt, or the one in the address): it unfurls with
 * the room-code card in a chat, and its one button opens the party card.
 * Inside <Suspense> (it reads the address).
 */
export function PartyShare({ code, showCode = true }: { code: string; showCode?: boolean }) {
  const base = useSyncExternalStore(subscribeNothing, origin, () => "");
  const shareable = useSyncExternalStore(subscribeNothing, canWebShare, () => false);
  const cemetery = useActiveCemetery();
  const [note, setNote] = useState<string | null>(null);
  const link = `${base}${cemetery ? sharePath({ kind: "party", cemetery: cemetery.qid, room: code }) : partyPath(code)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      shareEvent("share_created", "party", "copy");
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
      shareEvent("share_created", "party", "share-sheet");
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
          <SplitFlap value={code} testId="room-code" />
        </div>
      )}
      <label className="block">
        <span className="text-sm text-muted">Party link</span>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="field mt-1 w-full text-sm"
          data-testid="party-link"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {/* Web Share where the phone has it: the quickest way to every other phone (as in the séance). */}
        {shareable && (
          <button type="button" onClick={share} className="btn btn-ghost">
            Send the link
          </button>
        )}
        <button type="button" onClick={copy} className="btn btn-ghost">
          Copy link
        </button>
      </div>
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
    </div>
  );
}
