"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PartySeance } from "@/components/spirit/PartySeance";
import { cryptoRandom, makeRoomCode, normalizeRoomCode, partyPath } from "@/lib/games/bingo";
import type { SampleCemetery } from "@/lib/spirit/load";
import { PartyShare } from "./PartyShare";

/**
 * Start a party (a random room code in a link) or join one by typing its code,
 * and hold a séance with the same room code. No server involved.
 */
export function PartyLobby({ samples }: { samples: SampleCemetery[] }) {
  const router = useRouter();
  // ?join=1 (from "Joining a friend's party?"): straight to the room-code box.
  const joining = useSearchParams().get("join") !== null;
  useEffect(() => {
    if (joining) document.getElementById("room")?.focus();
  }, [joining]);
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  function startParty() {
    setCode(makeRoomCode(cryptoRandom));
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeRoomCode(typed);
    if (!c) {
      setError("Room codes are six letters (no I, L or O). Check the code and try again.");
      return;
    }
    setError(null);
    router.push(partyPath(c));
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="start" className="card space-y-3 p-4">
        <h2 id="start" className="font-display text-2xl">
          Start a party
        </h2>
        <p className="text-muted">
          You get a link and a room code. Everyone who opens the link gets the same bingo card. Nothing is sent to a
          server; the card comes from the code.
        </p>
        {/* Once there's a code, opening the card is the one primary action; the start button stays put (keeps focus). */}
        {code && (
          <div className="space-y-3">
            <PartyShare code={code} />
            <Link href={partyPath(code)} className="btn btn-primary btn-lg w-full">
              Open the party card
            </Link>
          </div>
        )}
        <button
          type="button"
          onClick={startParty}
          className={code ? "btn btn-ghost w-full" : "btn btn-primary btn-lg w-full"}
        >
          {code ? "Start a different party" : "Start a party"}
        </button>
      </section>

      <section aria-labelledby="join" className="card space-y-3 p-4">
        <h2 id="join" className="font-display text-2xl">
          Join a party
        </h2>
        <form onSubmit={join} className="flex flex-wrap items-end gap-2">
          <label htmlFor="room" className="w-full text-sm text-muted">
            Room code
          </label>
          <input
            id="room"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="e.g. KXMPRT"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            className="field field-code min-w-0 flex-1"
          />
          <button type="submit" className="btn btn-ghost">
            Join
          </button>
        </form>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>

      <PartySeance samples={samples} partyCode={code} />
    </div>
  );
}
