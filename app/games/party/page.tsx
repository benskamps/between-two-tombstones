import type { Metadata } from "next";
import { PartyLobby } from "@/components/games/PartyLobby";

export const metadata: Metadata = {
  title: "Graveyard Party",
  description: "Share one link and everyone plays Tombstone Bingo on the same card.",
};

export default function PartyPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Graveyard Party</h1>
        <p className="text-muted">Play Tombstone Bingo together: one link, the same card on every phone.</p>
      </header>
      <PartyLobby />
    </div>
  );
}
