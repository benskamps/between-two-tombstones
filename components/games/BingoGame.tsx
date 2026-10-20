"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  CENTER,
  bingoMessage,
  completedLines,
  cryptoRandom,
  makeCard,
  makeRoomCode,
  normalizeRoomCode,
  partySeed,
} from "@/lib/games/bingo";
import { SOLO_SEED_KEY, marksKey, parseMarks, readItem, subscribeStorage, writeItem } from "@/lib/games/storage";
import { FREE_SQUARE, symbolById } from "@/lib/games/symbols";
import { PartyShare } from "./PartyShare";

function newSoloSeed() {
  // Ten letters of crypto randomness; same alphabet as room codes, just longer.
  return `solo:${makeRoomCode(cryptoRandom)}${makeRoomCode(cryptoRandom).slice(0, 4)}`;
}

export function BingoGame() {
  const params = useSearchParams();
  const rawParty = params.get("party");
  const party = normalizeRoomCode(rawParty);

  const soloSeed = useSyncExternalStore(subscribeStorage, () => readItem(SOLO_SEED_KEY), () => null);
  // First visit: make this player's own seed (not needed in a party).
  useEffect(() => {
    if (!party && soloSeed === null) writeItem(SOLO_SEED_KEY, newSoloSeed());
  }, [party, soloSeed]);

  const seed = party ? partySeed(party) : soloSeed;
  const card = useMemo(() => (seed ? makeCard(seed) : null), [seed]);
  const rawMarks = useSyncExternalStore(subscribeStorage, () => (seed ? readItem(marksKey(seed)) : null), () => null);
  const marked = useMemo(() => parseMarks(rawMarks), [rawMarks]);
  const lines = completedLines(marked);
  const message = bingoMessage(lines);
  const winning = new Set(lines.flatMap((l) => l.cells));
  const [selected, setSelected] = useState<number | null>(null);

  function tap(i: number) {
    setSelected(i);
    if (!seed || i === CENTER) return;
    const next = new Set(marked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    writeItem(marksKey(seed), JSON.stringify([...next].sort((a, b) => a - b)));
  }

  function clearMarks() {
    if (seed) writeItem(marksKey(seed), "[]");
    setSelected(null);
  }

  function newCard() {
    writeItem(SOLO_SEED_KEY, newSoloSeed());
    setSelected(null);
  }

  if (!card || !seed) {
    return <p className="text-muted">Shuffling your card&hellip;</p>;
  }

  const chosen = selected !== null ? symbolById(card[selected]) : null;

  return (
    <div className="space-y-5">
      {rawParty && !party && (
        <p role="alert" className="text-danger">
          &ldquo;{rawParty}&rdquo; isn&rsquo;t a room code (six letters, no I, L or O). This is your own card instead.{" "}
          <Link href="/games/party" className="underline">
            Join a party
          </Link>
        </p>
      )}
      {party ? (
        <p className="rounded-xl border border-accent bg-surface-2 p-3">
          <strong>Party {party}.</strong> Everyone who opens this link has this same card.
        </p>
      ) : (
        <p className="text-muted">
          Your own card. Want everyone on the same card?{" "}
          <Link href="/games/party" className="underline">
            Start a party
          </Link>
          .
        </p>
      )}

      <div
        className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-surface p-1"
        data-testid="bingo-card"
        role="group"
        aria-label="Bingo card, 5 by 5. Tap a symbol when you find it."
      >
        {card.map((id, i) => {
          const s = symbolById(id);
          const isFree = i === CENTER;
          const on = isFree || marked.has(i);
          return (
            <button
              key={id}
              type="button"
              onClick={() => tap(i)}
              aria-pressed={on}
              data-symbol={id}
              className={`tap flex aspect-square items-center justify-center rounded-lg p-1 text-center text-[0.7rem] font-bold leading-tight sm:text-sm ${
                on ? "bg-accent text-accent-ink" : "bg-surface-2 text-text"
              } ${winning.has(i) ? "ring-4 ring-[var(--focus)]" : ""} ${selected === i ? "outline outline-2 outline-[var(--text)]" : ""}`}
            >
              <span className={isFree ? "font-display text-base sm:text-xl" : undefined}>{s?.label ?? id}</span>
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="min-h-[3rem] rounded-xl bg-surface-2 p-3">
        {chosen ? (
          <p>
            <strong>{chosen.name}:</strong> {chosen.meaning}
            {selected !== null && selected !== CENTER && (marked.has(selected) ? " Marked." : " Not marked.")}
          </p>
        ) : (
          <p className="text-muted">Tap a symbol when you spot it carved on a stone. Its meaning shows here.</p>
        )}
      </div>

      {message && (
        <p role="status" className="rounded-xl border-2 border-accent p-3 text-xl font-bold">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={clearMarks} className="tap rounded-lg border border-border px-4 font-bold">
          Clear marks
        </button>
        {!party && (
          <button type="button" onClick={newCard} className="tap rounded-lg border border-border px-4 font-bold">
            New card
          </button>
        )}
      </div>

      {party && (
        <section aria-labelledby="invite" className="space-y-2 rounded-xl border border-border bg-surface p-4">
          <h2 id="invite" className="font-display text-xl">
            Invite more people
          </h2>
          <PartyShare code={party} />
        </section>
      )}

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="tap flex cursor-pointer items-center font-bold">What the symbols on this card mean</summary>
        <dl className="mt-3 space-y-2">
          {card.map((id) => {
            const s = symbolById(id) ?? FREE_SQUARE;
            return (
              <div key={id}>
                <dt className="font-bold">{s.name}</dt>
                <dd className="text-muted">{s.meaning}</dd>
              </div>
            );
          })}
        </dl>
      </details>
    </div>
  );
}
