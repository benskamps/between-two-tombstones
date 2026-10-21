"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SplitFlap } from "@/components/ui/Instrument";
import { Lily, Moth, Sprout } from "@/components/ui/symbols";
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
import { BingoGlyph } from "./BingoGlyph";
import { PartyShare } from "./PartyShare";

function newSoloSeed() {
  // Ten letters of crypto randomness; same alphabet as room codes, just longer.
  return `solo:${makeRoomCode(cryptoRandom)}${makeRoomCode(cryptoRandom).slice(0, 4)}`;
}

export function BingoGame() {
  const params = useSearchParams();
  const rawParty = params.get("party");
  const party = normalizeRoomCode(rawParty);

  const soloSeed = useSyncExternalStore(
    subscribeStorage,
    () => readItem(SOLO_SEED_KEY),
    () => null,
  );
  // First visit: make this player's own seed (not needed in a party).
  useEffect(() => {
    if (!party && soloSeed === null) writeItem(SOLO_SEED_KEY, newSoloSeed());
  }, [party, soloSeed]);

  const seed = party ? partySeed(party) : soloSeed;
  const card = useMemo(() => (seed ? makeCard(seed) : null), [seed]);
  const rawMarks = useSyncExternalStore(
    subscribeStorage,
    () => (seed ? readItem(marksKey(seed)) : null),
    () => null,
  );
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
  const found = [...marked].filter((i) => i !== CENTER && i >= 0 && i < card.length).length;

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
        <div className="instrument bezel flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <span aria-hidden="true" className="flex items-center gap-3">
            <span className="label text-muted">Room</span>
            <SplitFlap value={party} small />
          </span>
          <p className="min-w-[12rem] flex-1">
            <strong>Party {party}.</strong> Everyone who opens this link has this same card.
          </p>
        </div>
      ) : (
        <p className="text-muted">
          Your own card. Want everyone on the same card?{" "}
          <Link href="/games/party" className="underline">
            Start a party
          </Link>
          .
        </p>
      )}

      <div className="space-y-2">
        <div className="bingo-strip">
          <span className="label">{party ? "Party card" : "Your card"}</span>
          <span className="readout text-lichen" data-testid="bingo-found">
            Found {found} / {card.length - 1}
          </span>
        </div>
        <div
          className="bingo-board"
          data-testid="bingo-card"
          role="group"
          aria-label="Bingo card, 5 by 5. Tap a symbol when you find it."
        >
          {card.map((id, i) => {
            const s = symbolById(id);
            const isFree = i === CENTER;
            const on = isFree || marked.has(i);
            const cls = [
              "bingo-tile",
              isFree && "bingo-free",
              winning.has(i) && "bingo-win",
              selected === i && "bingo-selected",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button key={id} type="button" onClick={() => tap(i)} aria-pressed={on} data-symbol={id} className={cls}>
                <BingoGlyph id={id} className="bingo-glyph" animate={isFree} />
                <span className="bingo-label">{s?.label ?? id}</span>
                {on && !isFree && <Sprout className="bingo-bloom" />}
              </button>
            );
          })}
        </div>
      </div>

      {message && (
        <div key={message} className="bingo-plaque">
          <span aria-hidden="true" className="bingo-art">
            <Moth className="bingo-moth" />
            <Lily className="bingo-lily" />
          </span>
          <p role="status" className="text-xl font-bold">
            {message}
          </p>
        </div>
      )}

      <div aria-live="polite" className="card flex min-h-[4.5rem] items-start gap-3 p-4">
        {chosen && (
          <BingoGlyph
            id={chosen.id}
            className={`mt-0.5 h-8 w-8 shrink-0 ${selected !== null && marked.has(selected) ? "text-lichen" : "text-muted"}`}
          />
        )}
        {chosen ? (
          <p>
            <strong>{chosen.name}:</strong> {chosen.meaning}
            {selected !== null && selected !== CENTER && (marked.has(selected) ? " Marked." : " Not marked.")}
          </p>
        ) : (
          <p className="text-muted">Tap a symbol when you spot it carved on a stone. Its meaning shows here.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={clearMarks} className="btn btn-ghost">
          Clear marks
        </button>
        {!party && (
          <button type="button" onClick={newCard} className="btn btn-ghost">
            New card
          </button>
        )}
      </div>

      {party && (
        <section aria-labelledby="invite" className="card space-y-3 p-4">
          <h2 id="invite" className="font-display text-2xl">
            Invite more people
          </h2>
          <PartyShare code={party} showCode={false} />
        </section>
      )}

      <details className="card p-4">
        <summary className="tap flex cursor-pointer items-center font-bold">What the symbols on this card mean</summary>
        <dl className="mt-3 space-y-3">
          {card.map((id) => {
            const s = symbolById(id) ?? FREE_SQUARE;
            return (
              <div key={id}>
                <dt className="flex items-center gap-2 font-bold">
                  <BingoGlyph id={s.id} className="h-6 w-6 shrink-0 text-muted" />
                  {s.name}
                </dt>
                <dd className="pl-8 text-muted">{s.meaning}</dd>
              </div>
            );
          })}
        </dl>
      </details>
    </div>
  );
}
