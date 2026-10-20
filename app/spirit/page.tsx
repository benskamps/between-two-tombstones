import type { Metadata } from "next";
import { Suspense } from "react";
import { SpiritBox, SpiritBoxFallback } from "@/components/spirit/SpiritBox";
import { SAMPLE_CEMETERIES } from "@/lib/spirit/samples";

export const metadata: Metadata = {
  title: "Spirit Box",
  description:
    "Static and low voices speaking the names of people buried at a cemetery who died at least 75 years ago.",
};

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
      {/* The picker reads ?cemetery= from the address bar, which is only known in the browser. */}
      <Suspense fallback={<SpiritBoxFallback />}>
        <SpiritBox samples={SAMPLE_CEMETERIES} />
      </Suspense>
    </div>
  );
}
