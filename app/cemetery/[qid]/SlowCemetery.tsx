"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SourceFailure } from "@/components/tour/SourceFailure";
import { OPENING_TIMEOUT_MS, RETRY_TIMEOUT_MS, slowFailure, stillLoadingText } from "@/lib/data/big";
import { userMessageFor } from "@/lib/data/errors";

type Outcome = { ok: true } | { ok: false; message: string | null };

/**
 * One automatic retry per cemetery per page session, shared by every mount
 * (and React's double effects in development); never a loop. A full reload,
 * the person's own "Try again", starts afresh.
 */
const attempts = new Map<string, Promise<Outcome>>();

function retryOnce(qid: string): Promise<Outcome> {
  let attempt = attempts.get(qid);
  if (!attempt) {
    attempt = fetch(`/api/cemeteries/${qid}/burials`, { signal: AbortSignal.timeout(RETRY_TIMEOUT_MS) })
      .then(async (res): Promise<Outcome> => {
        if (res.ok) return { ok: true };
        const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
        const message = typeof body?.error?.message === "string" ? body.error.message : null;
        // Timed out again: that's the size, said by slowFailure. Anything else keeps its own words.
        return { ok: false, message: message === userMessageFor("Wikidata", "timeout") ? null : message };
      })
      .catch((): Outcome => ({ ok: false, message: null }));
    attempts.set(qid, attempt);
  }
  return attempt;
}

type State = { phase: "retrying" } | { phase: "opening" } | { phase: "failed"; title?: string; message: string };

const failed = (people: number | null, message: string | null): State =>
  message ? { phase: "failed", message } : { phase: "failed", ...slowFailure(people) };

/**
 * The tour page's fallback when Wikidata timed out on a cemetery's burials
 * (review pass 2, N1): asks once more from the browser, visibly, then either
 * re-renders the page from the now-filled cache or says the cemetery is big.
 */
export function SlowCemetery({ qid, people }: { qid: string; people: number | null }) {
  const router = useRouter();
  // Mounted again after this session's retry already ran: don't retry, say so.
  const [state, setState] = useState<State>(() => (attempts.has(qid) ? failed(people, null) : { phase: "retrying" }));
  const retrying = state.phase === "retrying";

  useEffect(() => {
    if (!retrying) return;
    let live = true;
    retryOnce(qid).then((outcome) => {
      if (!live) return;
      if (outcome.ok) {
        // The answer is cached now: re-render the page from it.
        setState({ phase: "opening" });
        router.refresh();
      } else {
        setState(failed(people, outcome.message));
      }
    });
    return () => {
      live = false;
    };
  }, [retrying, qid, people, router]);

  // Capped: if the refreshed page still hasn't replaced this view, say so.
  const opening = state.phase === "opening";
  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(() => setState(failed(people, null)), OPENING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [opening, people]);

  if (state.phase === "failed") {
    return <SourceFailure source="Wikidata" title={state.title} message={state.message} retryHref={`/cemetery/${qid}`} />;
  }
  return (
    <div role="status" className="space-y-3" data-testid="slow-cemetery" data-btt-nocache="">
      <p className="font-display text-3xl">{opening ? "Got it. Opening the tour…" : "Gathering the stories…"}</p>
      <p className="font-bold" data-testid="slow-cemetery-message">
        {stillLoadingText(people)}
      </p>
      <p className="text-muted">Asking Wikidata once more; this can take up to half a minute.</p>
    </div>
  );
}
