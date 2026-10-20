"use client";

import { useEffect, useMemo, useState } from "react";
import { loadCemetery, type LoadResult, type SampleCemetery } from "@/lib/spirit/load";
import { bankHasNames, buildWordBank } from "@/lib/spirit/wordbank";
import { SEANCE_PITCH, SeanceStart } from "./SeanceStart";

/**
 * The graveyard party's séance: pick a sample cemetery, get a séance link.
 * Loads the names the same way the spirit box does (live route first, saved
 * copy as fallback), so the bank hash in the link matches what joiners load.
 */
export function PartySeance({ samples, partyCode }: { samples: SampleCemetery[]; partyCode: string | null }) {
  const [choice, setChoice] = useState(samples[0].qid);
  const [results, setResults] = useState<Record<string, LoadResult>>({});
  const result = results[choice];
  const bank = useMemo(() => (result?.ok ? buildWordBank(result.cemetery.people) : null), [result]);
  const ready = bank !== null && bankHasNames(bank);

  useEffect(() => {
    const ctrl = new AbortController();
    loadCemetery(choice, { fallback: samples.find((s) => s.qid === choice), signal: ctrl.signal }).then((r) => {
      if (!ctrl.signal.aborted) setResults((prev) => ({ ...prev, [choice]: r }));
    });
    return () => ctrl.abort();
  }, [choice, samples]);

  return (
    <section aria-labelledby="party-seance" className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 id="party-seance" className="font-display text-2xl">
        Hold a séance
      </h2>
      <p className="text-muted">{SEANCE_PITCH}</p>
      <fieldset className="space-y-2">
        <legend className="font-bold">Whose names</legend>
        {samples.map((s) => (
          <label
            key={s.qid}
            className={`tap flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
              choice === s.qid ? "border-accent bg-surface-2" : "border-border bg-bg"
            }`}
          >
            <input
              type="radio"
              name="party-seance-cemetery"
              value={s.qid}
              checked={choice === s.qid}
              onChange={() => setChoice(s.qid)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-bold">{s.name}</span>
              <span className="block text-sm text-muted">{s.place}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div role="status" className="text-sm">
        {!result && <p className="text-muted">Loading the names&hellip;</p>}
        {result && !result.ok && <p className="text-danger">{result.message}</p>}
        {result?.ok && !ready && (
          <p className="text-danger">Nobody in this list died 75 or more years ago, so there are no names to use.</p>
        )}
        {result?.ok && result.note && <p className="text-muted">{result.note}</p>}
      </div>
      <SeanceStart
        cemetery={result?.ok ? { qid: choice, name: result.cemetery.name } : null}
        bank={ready ? bank : null}
        partyCode={partyCode}
      />
    </section>
  );
}
