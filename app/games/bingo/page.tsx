import type { Metadata } from "next";
import { Suspense } from "react";
import { BingoGame } from "@/components/games/BingoGame";
import { HauntGate } from "@/components/haunt/HauntGate";
import { PageHeader } from "@/components/ui/Motifs";
import { Candle, Poppy } from "@/components/ui/symbols";

export const metadata: Metadata = {
  title: "Tombstone Bingo",
  description: "A 5×5 card of symbols carved on old headstones, with what each one traditionally means.",
};

export default function BingoPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Tombstone Bingo"
        death={<Candle className="h-5 w-5" />}
        life={<Poppy className="h-5 w-5" />}
        intro={
          <>
            Find these symbols carved on the stones. Five in a row, a column or a diagonal is a bingo. Look, don&rsquo;t
            touch: no leaning on or climbing stones.
          </>
        }
      />
      {/* The card depends on ?party= and on what this phone saved, so it renders in the browser. A party link always opens. */}
      <Suspense fallback={<p className="min-h-[85svh] text-muted">Shuffling your card&hellip;</p>}>
        <HauntGate tool="/games/bingo" share={["party"]}>
          <BingoGame />
        </HauntGate>
      </Suspense>
    </div>
  );
}
