import type { Metadata } from "next";
import { Suspense } from "react";
import { HauntGate } from "@/components/haunt/HauntGate";
import { SpiritBoxFallback } from "@/components/spirit/SpiritBox";
import { SpiritModes } from "@/components/spirit/SpiritModes";
import { PageHeader } from "@/components/ui/Motifs";
import { Candle } from "@/components/ui/symbols";
import { SAMPLE_CEMETERIES } from "@/lib/spirit/samples";

export const metadata: Metadata = {
  title: "Spirit Box",
  description:
    "Static and low voices speaking the names of people buried at a cemetery who died at least 75 years ago. Séance mode makes every phone speak the same names at the same second.",
};

const KNOWN = SAMPLE_CEMETERIES.map(({ qid, name, place }) => ({ qid, name, place }));

export default function SpiritPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Spirit Box"
        tool="spirit"
        life={<Candle className="h-5 w-5" />}
        intro="Radio static, and low voices saying the names of people buried in the cemetery. Only people who died at least 75 years ago are used."
      />
      {/* ?cemetery= and ?seance= come from the address bar, which is only known in the browser. */}
      {/* A séance link someone sent, or ?join=1 (type a room code), always opens; otherwise this needs a haunt. */}
      {/* The fallback holds about the tool's height so the footer doesn't jump into view and out again (CLS). */}
      <Suspense
        fallback={
          <div className="min-h-[85svh]">
            <SpiritBoxFallback />
          </div>
        }
      >
        <HauntGate tool="/spirit" share={["seance", "join"]} known={KNOWN}>
          <SpiritModes samples={SAMPLE_CEMETERIES} />
        </HauntGate>
      </Suspense>
    </div>
  );
}
