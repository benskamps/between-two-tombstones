"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ReadoutStrip } from "@/components/ui/Instrument";
import { StepHeading, SymbolPair } from "@/components/ui/Motifs";
import { EpitaphRiddle, Lily } from "@/components/ui/symbols";
import { makeRiddleRound, riddleEligiblePeople, type RiddlePerson } from "@/lib/games/whoami";
import { useHaunt } from "@/lib/haunt/useHaunt";
import { recordRiddleSolved } from "@/lib/passport/store";
import { QID_RE } from "@/lib/spirit/load";

export type RiddleSample = {
  qid: string;
  name: string;
  place: string;
  people: RiddlePerson[];
};

export function WhoAmIGame({ samples }: { samples: RiddleSample[] }) {
  const params = useSearchParams();
  const rawTour = params.get("cemetery");
  const tourQid = rawTour && QID_RE.test(rawTour) ? rawTour : null;
  const haunt = useHaunt();
  const targetQid = tourQid ?? haunt?.qid ?? samples[0].qid;

  const [fetched, setFetched] = useState<Record<string, { name: string; people: RiddlePerson[] } | "error">>({});
  const [roundIdx, setRoundIdx] = useState(0);
  const [cluesShown, setCluesShown] = useState(1);
  const [guessQid, setGuessQid] = useState<string | null>(null);
  const [solvedCount, setSolvedCount] = useState(0);

  const sampleMatch = samples.find((s) => s.qid === targetQid);

  useEffect(() => {
    if (sampleMatch || fetched[targetQid]) return;
    const ctrl = new AbortController();
    fetch(`/api/cemeteries/${targetQid}/burials`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { cemetery?: { name?: string }; people?: RiddlePerson[] };
        if (!ctrl.signal.aborted) {
          setFetched((prev) => ({
            ...prev,
            [targetQid]: {
              name: data.cemetery?.name ?? haunt?.name ?? "Your haunt",
              people: data.people ?? [],
            },
          }));
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setFetched((prev) => ({ ...prev, [targetQid]: "error" }));
        }
      });
    return () => ctrl.abort();
  }, [targetQid, sampleMatch, fetched, haunt?.name]);

  const activeSource = useMemo(() => {
    if (sampleMatch) return { name: sampleMatch.name, people: sampleMatch.people, fallbackNote: null };
    const f = fetched[targetQid];
    if (f && f !== "error") {
      const elig = riddleEligiblePeople(f.people);
      if (elig.length >= 4) return { name: f.name, people: f.people, fallbackNote: null };
      return {
        name: samples[0].name,
        people: samples[0].people,
        fallbackNote: `Not enough older burials with full records at ${f.name}, so these riddles come from ${samples[0].name}.`,
      };
    }
    if (f === "error") {
      return {
        name: samples[0].name,
        people: samples[0].people,
        fallbackNote: `Couldn’t reach Wikidata for your haunt right now, so these riddles come from ${samples[0].name}.`,
      };
    }
    return null;
  }, [sampleMatch, fetched, targetQid, samples]);

  const eligible = useMemo(() => (activeSource ? riddleEligiblePeople(activeSource.people) : []), [activeSource]);
  const round = useMemo(() => makeRiddleRound(eligible, roundIdx), [eligible, roundIdx]);

  if (!activeSource || !round) {
    return (
      <div className="card p-4" role="status">
        <p className="text-muted">Reading the stones for riddles&hellip;</p>
      </div>
    );
  }

  const answered = guessQid !== null;
  const correct = guessQid === round.answer.qid;

  function choose(qid: string) {
    if (answered) return;
    setGuessQid(qid);
    if (qid === round?.answer.qid) {
      setSolvedCount((c) => c + 1);
      recordRiddleSolved();
    }
    setCluesShown(3);
  }

  function nextRiddle() {
    setRoundIdx((i) => i + 1);
    setCluesShown(1);
    setGuessQid(null);
  }

  return (
    <div className="space-y-5" data-testid="whoami-game">
      {activeSource.fallbackNote && <p className="card p-3 text-sm text-muted">{activeSource.fallbackNote}</p>}

      <section aria-label="Riddle card" className="arch arch-rule space-y-4">
        <div className="text-center space-y-1">
          <SymbolPair
            className="justify-center"
            death={<EpitaphRiddle className="h-6 w-6" />}
            life={<Lily className="h-6 w-6" />}
          />
          <p className="label text-muted">{activeSource.name}</p>
          <h2 className="font-display text-2xl">Riddle {(roundIdx % eligible.length) + 1} of {eligible.length}</h2>
        </div>

        <ReadoutStrip
          tone="candle"
          live={!answered}
          status={answered ? (correct ? "Found" : "Revealed") : `Clue ${cluesShown} / 3`}
          values={[
            { label: "Solved", value: String(solvedCount) },
          ]}
        />

        <ol className="space-y-3">
          {round.clues.slice(0, cluesShown).map((clue, idx) => (
            <li key={idx} className="card bg-surface-2 p-3 space-y-1" data-testid={`whoami-clue-${idx + 1}`}>
              <StepHeading n={idx + 1} as="h3">
                {idx === 0 ? "The stone’s dates" : idx === 1 ? "Their calling" : "From their story"}
              </StepHeading>
              <p>{clue}</p>
            </li>
          ))}
        </ol>

        {!answered && cluesShown < 3 && (
          <button
            type="button"
            onClick={() => setCluesShown((c) => Math.min(3, c + 1))}
            className="btn btn-ghost w-full"
          >
            Reveal clue {cluesShown + 1} of 3
          </button>
        )}

        <div className="space-y-2" role="group" aria-label="Whose stone is this?">
          <p className="label text-muted text-center">Whose stone is this?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {round.options.map((opt) => {
              const isChosen = guessQid === opt.qid;
              const isAnswer = opt.qid === round.answer.qid;
              let btnClass = "btn-ghost";
              if (answered) {
                if (isAnswer) btnClass = "btn-candle";
                else if (isChosen) btnClass = "btn-stop";
              }
              return (
                <button
                  key={opt.qid}
                  type="button"
                  disabled={answered}
                  onClick={() => choose(opt.qid)}
                  data-testid="whoami-option"
                  className={`btn ${btnClass} w-full justify-start px-4 py-3 text-left font-display text-xl`}
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        </div>

        {answered && (
          <div role="status" className="card bg-surface-2 space-y-2 p-4" data-testid="whoami-verdict">
            <p className="font-display text-2xl text-candle">
              {correct ? `Yes — ${round.answer.name}.` : `That stone belongs to ${round.answer.name}.`}
            </p>
            {round.answer.description && <p className="text-sm text-muted">{round.answer.description}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={nextRiddle} className="btn btn-primary">
                Next riddle
              </button>
              <Link href={`/cemetery/${targetQid}#stop-${round.answer.qid}`} className="btn btn-ghost">
                Read their stop
              </Link>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/games" className="btn btn-ghost">
          Back to the games
        </Link>
        <Link href="/p" className="btn btn-ghost">
          Open Graveyard Passport
        </Link>
      </div>
    </div>
  );
}
