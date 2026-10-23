import type { Metadata } from "next";
import { Suspense } from "react";
import { EvpHubLink } from "@/components/games/EvpRecorder";
import { HauntGate } from "@/components/haunt/HauntGate";
import { GateNeutral } from "@/components/haunt/PickHauntFirst";
import { PageHeader } from "@/components/ui/Motifs";
import { Lily } from "@/components/ui/symbols";
import { ToolTile, type ToolId } from "@/components/ui/tools";

export const metadata: Metadata = {
  title: "Graveyard Games",
  description: "Tombstone Bingo, graveyard parties and an EVP recorder to play with while you walk.",
};

const GAMES: { href: string; title: string; body: string; tool: ToolId }[] = [
  {
    href: "/games/bingo",
    title: "Tombstone Bingo",
    body: "Spot carved symbols (lambs, willows, broken columns) and learn what each one means.",
    tool: "bingo",
  },
  {
    href: "/games/party",
    title: "Graveyard Party",
    body: "Send one link; everyone who opens it plays on the same bingo card.",
    tool: "party",
  },
  {
    href: "/spirit#seance",
    title: "Séance",
    body: "Every phone on one link speaks the same spirit words at the same second.",
    tool: "seance",
  },
  {
    href: "/games/whoami",
    title: "Who Am I?",
    body: "Three clues from a stone at your haunt: dates, calling, and a line from their life.",
    tool: "whoami",
  },
  {
    href: "/games/stonemath",
    title: "Stone Math",
    body: "Work a birth date back from “Aged 34 y'rs 2 m's 11 d's”, the way the stonecutter subtracted it.",
    tool: "stonemath",
  },
  {
    href: "/p",
    title: "Graveyard Passport",
    body: "Your pocket ledger of cemeteries visited, graves pinned, stamps pressed and badges earned.",
    tool: "passport",
  },
];

export default function GamesPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Graveyard Games"
        tool="games"
        life={<Lily className="h-5 w-5" />}
        intro={<>Something to do while you walk. Stay on the paths and give mourners space.</>}
      />
      <Suspense fallback={<GateNeutral />}>
        <HauntGate tool="/games">
          <ul className="grid gap-3">
            {GAMES.map((g) => (
              <li key={g.href}>
                <ToolTile tool={g.tool} href={g.href} title={g.title} body={g.body} />
              </li>
            ))}
            {/* Only shown when this browser can record from a microphone. */}
            <EvpHubLink />
          </ul>
        </HauntGate>
      </Suspense>
    </div>
  );
}
