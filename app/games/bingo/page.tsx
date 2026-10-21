import type { Metadata } from "next";
import { Suspense } from "react";
import { BingoGame } from "@/components/games/BingoGame";
import { HauntGate } from "@/components/haunt/HauntGate";

export const metadata: Metadata = {
  title: "Tombstone Bingo",
  description: "A 5×5 card of symbols carved on old headstones, with what each one traditionally means.",
};

export default function BingoPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Tombstone Bingo</h1>
        <p className="text-muted">
          Find these symbols carved on the stones. Five in a row, a column or a diagonal is a bingo. Look, don&rsquo;t
          touch: no leaning on or climbing stones.
        </p>
      </header>
      {/* The card depends on ?party= and on what this phone saved, so it renders in the browser. A party link always opens. */}
      <Suspense fallback={<p className="text-muted">Shuffling your card&hellip;</p>}>
        <HauntGate tool="Tombstone Bingo" share={["party"]}>
          <BingoGame />
        </HauntGate>
      </Suspense>
    </div>
  );
}
