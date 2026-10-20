import type { Metadata } from "next";
import { PartyLobby } from "@/components/games/PartyLobby";
import { SAMPLE_CEMETERIES } from "@/lib/spirit/samples";

export const metadata: Metadata = {
  title: "Graveyard Party",
  description:
    "Share one link and everyone plays Tombstone Bingo on the same card, or holds a séance where every phone speaks the same names at the same second.",
};

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
      <PartyLobby samples={SAMPLE_CEMETERIES} />
    </div>
  );
}
