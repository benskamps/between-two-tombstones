"use client";

import { useState, useSyncExternalStore } from "react";
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
      <div>
        <p className="text-sm text-muted">Séance room code</p>
        <p className="font-mono text-4xl font-bold tracking-[0.3em]" data-testid="seance-code">
          {code}
        </p>
      </div>
      <label className="block">
        <span className="text-sm text-muted">Séance link</span>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="tap mt-1 w-full rounded-lg border border-border bg-bg px-3 font-mono text-sm"
          data-testid="seance-link"
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
