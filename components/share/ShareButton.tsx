"use client";

import { useState } from "react";
import { shareEvent } from "@/lib/share/analytics";
import type { ShareKind } from "@/lib/share/links";

type State = { kind: "idle" } | { kind: "note"; message: string } | { kind: "manual"; url: string };

/**
 * A ghost pill that shares a /s/ link: the phone's share sheet where there is
 * one, else the clipboard, else the link shown to copy by hand. The link
 * carries only IDs (lib/share/links.ts); the page it opens is drawn from
 * Wikidata and Wikipedia.
 */
export function ShareButton({
  kind,
  path,
  title,
  text,
  label = "Share",
  context,
  className = "btn btn-ghost",
}: {
  kind: ShareKind;
  /** The share path, e.g. /s/stop/Q2008469/Q173540; made absolute on this origin. */
  path: string;
  title: string;
  text: string;
  label?: string;
  /** Read after the label by screen readers, when the label alone is ambiguous ("Share" on every card). */
  context?: string;
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        shareEvent("share_created", kind, "share-sheet");
        setState({ kind: "note", message: "Shared." });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setState({ kind: "idle" });
          return;
        }
        // Any other refusal (no permission, the tap expired): copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      shareEvent("share_created", kind, "copy");
      setState({ kind: "note", message: "Link copied. Paste it into a message." });
    } catch {
      shareEvent("share_created", kind, "manual");
      setState({ kind: "manual", url });
    }
  }

  return (
    <>
      <button type="button" onClick={share} className={className} data-testid={`share-${kind}`}>
        {label}
        {context && <span className="sr-only"> {context}</span>}
      </button>
      {state.kind !== "idle" && (
        <div role="status" className="w-full text-sm" data-testid={`share-${kind}-status`}>
          {state.kind === "note" ? (
            <p>{state.message}</p>
          ) : (
            <label className="block">
              <span>This browser won&rsquo;t copy for us. Press and hold the link to copy it.</span>
              <input readOnly value={state.url} onFocus={(e) => e.currentTarget.select()} className="field mt-1 w-full text-sm" />
            </label>
          )}
        </div>
      )}
    </>
  );
}
