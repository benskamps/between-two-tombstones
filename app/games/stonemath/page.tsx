import type { Metadata } from "next";
import { Suspense } from "react";
import { StoneMathTool } from "@/components/games/StoneMathTool";
import { HauntGate } from "@/components/haunt/HauntGate";
import { GateNeutral } from "@/components/haunt/PickHauntFirst";
import { PageHeader } from "@/components/ui/Motifs";
import { Candle } from "@/components/ui/symbols";

export const metadata: Metadata = {
  title: "Stone Math",
  description: "Work a birth date back from a 19th-century “Aged 34 y'rs 2 m's 11 d's” carving, or find the exact carved age between two dates.",
};

export default function StoneMathPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Stone Math"
        tool="stonemath"
        life={<Candle className="h-5 w-5" />}
        intro={
          <>
            Many 19th-century stones give the date of death and &ldquo;Aged 34 y&rsquo;rs 2 m&rsquo;s 11 d&rsquo;s&rdquo;,
            never the birth date. Work it back the way the stonecutter subtracted it.
          </>
        }
      />
      <Suspense fallback={<GateNeutral />}>
        <HauntGate tool="/games/stonemath">
          <StoneMathTool />
        </HauntGate>
      </Suspense>
    </div>
  );
}
