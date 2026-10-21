import type { Metadata } from "next";
import { Suspense } from "react";
import { PartyLobby } from "@/components/games/PartyLobby";
import { HauntGate } from "@/components/haunt/HauntGate";
import { GateNeutral } from "@/components/haunt/PickHauntFirst";
import { SAMPLE_CEMETERIES } from "@/lib/spirit/samples";

export const metadata: Metadata = {
  title: "Graveyard Party",
  description:
    "Share one link and everyone plays Tombstone Bingo on the same card, or holds a séance where every phone speaks the same names at the same second.",
};

const KNOWN = SAMPLE_CEMETERIES.map(({ qid, name, place }) => ({ qid, name, place }));

export default function PartyPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Graveyard Party</h1>
        <p className="text-muted">
          Play Tombstone Bingo together: one link, the same card on every phone. Or hold a séance: every phone speaks
          the same names at the same second.
        </p>
      </header>
      {/* Starting a party needs a haunt; the party link it makes opens for anyone (see /games/bingo). */}
      <Suspense fallback={<GateNeutral />}>
        <HauntGate tool="/games/party" known={KNOWN}>
          <PartyLobby samples={SAMPLE_CEMETERIES} />
        </HauntGate>
      </Suspense>
    </div>
  );
}
