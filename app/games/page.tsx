import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Graveyard Games",
  description: "Tombstone Bingo and graveyard parties to play while you walk.",
};

const GAMES = [
  {
    href: "/games/bingo",
    title: "Tombstone Bingo",
    body: "Spot carved symbols (lambs, willows, broken columns) and learn what each one means.",
  },
  {
    href: "/games/party",
    title: "Graveyard Party",
    body: "Send one link; everyone who opens it plays on the same bingo card.",
  },
];

export default function GamesPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Graveyard Games</h1>
        <p className="text-muted">Something to do while you walk. Stay on the paths and give mourners space.</p>
      </header>
      <ul className="grid gap-3">
        {GAMES.map((g) => (
          <li key={g.href}>
            <Link href={g.href} className="tap block rounded-xl border border-border bg-surface p-4">
              <span className="font-display text-xl">{g.title}</span>
              <span className="block text-muted">{g.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
