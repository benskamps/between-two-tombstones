"use client";

import { useEffect, useState } from "react";
import { getSavedTour, saveTour, type SavedTourData } from "./store";
import { cachePagesForOffline } from "./sw-client";

type State =
  | { kind: "checking" }
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: string; pageCached: boolean }
  | { kind: "error"; message: string };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * "Download this tour": saves the full CemeterySnapshot (every person and
 * story) to IndexedDB and asks the service worker to keep this page and its
 * scripts, so the tour opens with the network off.
 */
export function DownloadTourButton({ data, onSaved }: { data: SavedTourData; onSaved?: (savedAt: string) => void }) {
  const qid = data.cemetery.qid;
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let live = true;
    getSavedTour(qid).then((saved) => {
      if (!live) return;
      setState(saved ? { kind: "saved", savedAt: saved.savedAt, pageCached: true } : { kind: "idle" });
    });
    return () => {
      live = false;
    };
  }, [qid]);

  async function download() {
    setState({ kind: "saving" });
    try {
      const saved = await saveTour(data);
      const cached = await cachePagesForOffline([location.pathname, "/cemetery/saved"]);
      setState({ kind: "saved", savedAt: saved.savedAt, pageCached: cached.ok });
      onSaved?.(saved.savedAt);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Couldn't save the tour on this phone." });
    }
  }

  if (state.kind === "checking") return <div className="h-12" aria-hidden />;

  if (state.kind === "saved") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-2" data-testid="offline-status">
        <p className="flex-1 text-sm">
          <span className="font-bold text-moss">Saved for offline use</span>
          <span className="text-muted"> · {formatWhen(state.savedAt)}. Every story on this page opens without a signal.</span>
          {!state.pageCached && (
            <span className="block text-muted">The stories are on this phone; open them from Saved tours if this page won&rsquo;t load offline.</span>
          )}
        </p>
        <button type="button" onClick={download} className="tap rounded-lg border border-border px-3 text-sm">
          Update copy
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={state.kind === "saving"}
        className="tap w-full rounded-xl border border-border bg-surface-2 px-4 font-bold disabled:opacity-70"
      >
        {state.kind === "saving" ? "Saving the tour…" : "Download this tour"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}
