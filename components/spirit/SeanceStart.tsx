"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cryptoRandom, makeRoomCode, normalizeRoomCode } from "@/lib/games/bingo";
import { bankHash, seancePath } from "@/lib/spirit/seance";
import type { WordBank } from "@/lib/spirit/wordbank";
import { SeanceInvite } from "./SeanceInvite";

export const SEANCE_PITCH =
  "Every phone that joins speaks the same spirit words at the same second. Nothing is sent to a server: the words come from the room code and the clock.";

/**
 * "Start a séance": makes a room code (the party's, when there is one) and shows
 * the link with the cemetery and the hash of its names. Nothing plays here;
 * each phone, this one included, opens the link and taps Join.
 */
export function SeanceStart({
  cemetery,
  bank,
  partyCode = null,
}: {
  /** The cemetery whose names the séance uses; null while loading. */
  cemetery: { qid: string; name: string } | null;
  /** Its word bank; null while loading or when there are no names to use. */
  bank: WordBank | null;
  /** Reuse the graveyard party's room code for the first séance. */
  partyCode?: string | null;
}) {
  const [code, setCode] = useState<string | null>(null);
  const hash = useMemo(() => (bank ? bankHash(bank) : null), [bank]);
  const ready = cemetery !== null && hash !== null;
  const path = code && ready ? seancePath(code, cemetery.qid, hash) : null;

  function start() {
    if (!ready) return;
    setCode(code === null && partyCode ? partyCode : makeRoomCode(cryptoRandom));
  }

  return (
    <div className="space-y-3">
      {/* Before a séance exists, starting one is the main thing; after, opening it is (REVIEW-2). */}
      <button
        type="button"
        onClick={start}
        disabled={!ready}
        className={`btn w-full ${code ? "btn-ghost" : "btn-primary btn-lg"}`}
      >
        {code ? "Start a different séance" : "Start a séance"}
      </button>
      {ready && <p className="text-sm text-muted">The séance uses the names from {cemetery.name}.</p>}
      {code === null && partyCode && ready && (
        <p className="text-sm text-muted">It uses your party’s room code, {partyCode}.</p>
      )}
      {code && path && cemetery && (
        <div className="space-y-3">
          <Link href={path} className="btn btn-primary btn-lg w-full">
            Open the séance on this phone
          </Link>
          <SeanceInvite code={code} path={path} cemeteryName={cemetery.name} />
        </div>
      )}
    </div>
  );
}

/** "Join a séance" by typing its room code. Uses the cemetery picked on this page. */
export function SeanceJoin({ cemeteryQid, disabled }: { cemeteryQid: string; disabled?: boolean }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeRoomCode(typed);
    if (!c) {
      setError("Room codes are six letters (no I, L or O). Check the code and try again.");
      return;
    }
    setError(null);
    router.push(seancePath(c, cemeteryQid, null));
  }

  return (
    <form onSubmit={join} className="space-y-2">
      <label htmlFor="seance-room" className="block font-bold">
        Join a séance
      </label>
      <p className="text-sm text-muted">
        Type the room code from the person who started it. Pick the same cemetery as them first (above), or the names
        won’t line up.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          id="seance-room"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="e.g. KXMPRT"
          aria-label="Séance room code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          disabled={disabled}
          className="field flex-1 font-mono uppercase tracking-widest"
        />
        <button type="submit" disabled={disabled} className="btn btn-ghost">
          Join
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
