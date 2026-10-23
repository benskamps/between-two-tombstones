import type { Metadata } from "next";
import { Suspense } from "react";
import { WhoAmIGame, type RiddleSample } from "@/components/games/WhoAmIGame";
import { HauntGate } from "@/components/haunt/HauntGate";
import { GateNeutral } from "@/components/haunt/PickHauntFirst";
import { PageHeader } from "@/components/ui/Motifs";
import { Lily } from "@/components/ui/symbols";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import sleepyHollow from "@/data/snapshots/sleepy-hollow.json";
import { riddleEligiblePeople } from "@/lib/games/whoami";
import type { CemeterySnapshot } from "@/lib/types";

export const metadata: Metadata = {
  title: "Who Am I?",
  description: "Three clues from a stone at your haunt: dates, calling, and a redacted line from their life.",
};

function makeSample(snap: CemeterySnapshot, place: string): RiddleSample {
  return {
    qid: snap.cemetery.qid,
    name: snap.cemetery.name,
    place,
    people: riddleEligiblePeople(snap.people).slice(0, 30),
  };
}

const RIDDLE_SAMPLES: RiddleSample[] = [
  makeSample(oakland as CemeterySnapshot, "Atlanta, Georgia"),
  makeSample(sleepyHollow as CemeterySnapshot, "Sleepy Hollow, New York"),
];

export default function WhoAmIPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Who Am I?"
        tool="whoami"
        life={<Lily className="h-5 w-5" />}
        intro={
          <>
            Three clues from a grave at your haunt: first the stone&rsquo;s dates, then their calling, then a line from
            their life.
          </>
        }
      />
      <Suspense fallback={<GateNeutral />}>
        <HauntGate tool="/games/whoami">
          <WhoAmIGame samples={RIDDLE_SAMPLES} />
        </HauntGate>
      </Suspense>
    </div>
  );
}
