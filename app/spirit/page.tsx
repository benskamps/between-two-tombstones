import type { Metadata } from "next";
import { Suspense } from "react";
import { HauntGate } from "@/components/haunt/HauntGate";
import { SpiritBoxFallback } from "@/components/spirit/SpiritBox";
import { SpiritModes } from "@/components/spirit/SpiritModes";
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
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Spirit Box</h1>
        <p className="text-muted">
          Radio static, and low voices saying the names of people buried in the cemetery. Only people who died at
          least 75 years ago are used.
        </p>
      </header>
      {/* ?cemetery= and ?seance= come from the address bar, which is only known in the browser. */}
      {/* A séance link someone sent always opens; otherwise this needs a haunt. */}
      <Suspense fallback={<SpiritBoxFallback />}>
        <HauntGate tool="Spirit Box" share={["seance"]} known={KNOWN}>
          <SpiritModes samples={SAMPLE_CEMETERIES} />
        </HauntGate>
      </Suspense>
    </div>
  );
}
