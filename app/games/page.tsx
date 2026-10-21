import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { BingoGlyph } from "@/components/games/BingoGlyph";
import { EvpHubLink } from "@/components/games/EvpRecorder";
import { HauntGate } from "@/components/haunt/HauntGate";
import { GateNeutral } from "@/components/haunt/PickHauntFirst";
import { Candle, Planchette } from "@/components/ui/symbols";
import "@/components/games/games.css";

export const metadata: Metadata = {
  title: "Graveyard Games",
  description: "Tombstone Bingo, graveyard parties and an EVP recorder to play with while you walk.",
};

const GAMES: { href: string; title: string; body: string; art: ReactNode }[] = [
  {
    href: "/games/bingo",
    title: "Tombstone Bingo",
    body: "Spot carved symbols (lambs, willows, broken columns) and learn what each one means.",
    art: <BingoGlyph id="weeping-willow" />,
  },
  {
    href: "/games/party",
    title: "Graveyard Party",
    body: "Send one link; everyone who opens it plays on the same bingo card.",
    art: <Candle />,
  },
  {
    href: "/spirit#seance",
    title: "Séance",
    body: "Every phone on one link speaks the same spirit words at the same second.",
    art: <Planchette />,
  },
];

export default function GamesPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Graveyard Games</h1>
        <p className="text-muted">Something to do while you walk. Stay on the paths and give mourners space.</p>
      </header>
      <Suspense fallback={<GateNeutral />}>
        <HauntGate tool="/games">
          <ul className="grid gap-3">
            {GAMES.map((g) => (
              <li key={g.href}>
                <Link href={g.href} className="card tap flex items-center gap-4 p-4">
                  <span aria-hidden="true" className="games-medallion">
                    {g.art}
                  </span>
                  <span>
                    <span className="font-display text-xl">{g.title}</span>
                    <span className="block text-muted">{g.body}</span>
                  </span>
                </Link>
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
