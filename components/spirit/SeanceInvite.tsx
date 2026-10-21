"use client";

import { useState, useSyncExternalStore } from "react";
import { SplitFlap } from "@/components/ui/Instrument";
import { subscribeNothing } from "./shared";

function canWebShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

function origin() {
  return window.location.origin;
}

/** The séance room code, its link, a copy button and (where the phone has it) a share button. */
export function SeanceInvite({ code, path, cemeteryName }: { code: string; path: string; cemeteryName: string }) {
  const base = useSyncExternalStore(subscribeNothing, origin, () => "");
  const shareable = useSyncExternalStore(subscribeNothing, canWebShare, () => false);
  const [note, setNote] = useState<string | null>(null);
  const link = `${base}${path}`;

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
        title: "Séance",
        text: `Join my séance at ${cemeteryName}. Room code ${code}.`,
        url: link,
      });
      setNote(null);
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") setNote("Couldn’t open sharing. Copy the link instead.");
    }
  }

  return (
    <div className="space-y-3">
      {/* The same split-flap readout as the party's room code. */}
      <div className="instrument bezel space-y-2 px-4 py-3">
        <p className="label text-muted">Séance room code</p>
        <SplitFlap value={code} testId="seance-code" />
      </div>
      {/* Someone joining by code picks the same cemetery, so say which (F13). */}
      <p className="text-sm">
        Cemetery: <span className="font-bold">{cemeteryName}</span>. Anyone joining by code picks it first.
      </p>
      <label className="block">
        <span className="text-sm text-muted">Séance link</span>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="field mt-1 w-full text-sm"
          data-testid="seance-link"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {/* Web Share where the phone has it: the quickest way to every other phone. */}
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
