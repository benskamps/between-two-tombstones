import type { Metadata } from "next";
import { Suspense } from "react";
import { PartyLobby } from "@/components/games/PartyLobby";
import { HauntGate } from "@/components/haunt/HauntGate";
import { GateNeutral } from "@/components/haunt/PickHauntFirst";
import { SAMPLE_CEMETERIES } from "@/lib/spirit/samples";
import { PageHeader } from "@/components/ui/Motifs";
import { Lily } from "@/components/ui/symbols";

export const metadata: Metadata = {
  title: "Graveyard Party",
  description:
    "Share one link and everyone plays Tombstone Bingo on the same card, or holds a séance where every phone speaks the same names at the same second.",
};

const KNOWN = SAMPLE_CEMETERIES.map(({ qid, name, place }) => ({ qid, name, place }));

export default function PartyPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Graveyard Party"
        tool="party"
        life={<Lily className="h-5 w-5" />}
        intro={
          <>
            Play Tombstone Bingo together: one link, the same card on every phone. Or hold a séance: every phone speaks
            the same names at the same second.
          </>
        }
      />
      {/* Starting a party needs a haunt; the party link it makes opens for anyone (see /games/bingo). */}
      <Suspense fallback={<GateNeutral />}>
        {/* ?join=1 (typing a friend's room code) opens without a haunt. */}
        <HauntGate tool="/games/party" share={["join"]} known={KNOWN}>
          <PartyLobby samples={SAMPLE_CEMETERIES} />
        </HauntGate>
      </Suspense>
    </div>
  );
}
