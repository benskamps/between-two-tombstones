"use client";

import { useRef, useState } from "react";
import type { ReadingSection } from "@/lib/stamp/reading";
import { postReadStone } from "@/lib/stamp/readStone";

type Props = {
  disabled: boolean;
  getImages: () => Promise<{ straightened: Blob; contrast: Blob }>;
};

/** Sends the straightened and contrast-boosted images to /api/read-stone, only on a tap. */
export function ReadWithClaude({ disabled, getImages }: Props) {
  const [busy, setBusy] = useState(false);
  const [sections, setSections] = useState<ReadingSection[] | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function read() {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setError(null);
    setSections(null);
    const timer = setTimeout(() => ac.abort(), 60000);
    try {
      const { straightened, contrast } = await getImages();
      const res = await postReadStone(straightened, contrast, fetch, ac.signal);
      if (res.ok) {
        setSections(res.sections);
        setCached(res.cached);
      } else {
        setError(res.message);
        if (res.sections) setSections(res.sections);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't reach the reader.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Your photo is sent to Claude only when you tap this, and is not stored.</p>
      <button
        type="button"
        onClick={read}
        disabled={disabled || busy}
        className="tap w-full rounded-xl border border-border bg-surface-2 px-4 font-bold disabled:opacity-60"
      >
        {busy ? "Reading the stone…" : "Read with Claude"}
      </button>
      <div aria-live="polite" data-testid="reading" className="space-y-3">
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        {sections && (
          <div className="space-y-2 rounded-xl border border-border bg-surface p-4">
            <dl className="space-y-3">
              {sections.map((s) => (
                <div key={s.label}>
                  <dt className="text-sm font-bold text-muted">{s.label}</dt>
                  {s.label === "Check by eye" ? (
                    <dd>
                      <ul className="list-disc pl-5">
                        {s.lines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </dd>
                  ) : (
                    s.lines.map((line, i) => (
                      <dd key={i} className={s.label === "What the stone says" ? "whitespace-pre-wrap font-display text-lg" : ""}>
                        {line}
                      </dd>
                    ))
                  )}
                </div>
              ))}
            </dl>
            <p className="pt-1 text-sm text-muted">
              Read by Claude from your photo{cached ? " (a saved reading of this same photo)" : ""}. [?] marks letters it
              couldn&rsquo;t make out. Check names and dates against the stone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
