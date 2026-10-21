import type { Metadata } from "next";
import { Suspense } from "react";
import { HauntGate } from "@/components/haunt/HauntGate";
import { GateNeutral } from "@/components/haunt/PickHauntFirst";
import { StampKit } from "@/components/stamp/StampKit";
import { PageHeader } from "@/components/ui/Motifs";
import { Fern, Gate } from "@/components/ui/symbols";

export const metadata: Metadata = {
  title: "Stamp Kit",
  description:
    "Turn a photo of a headstone into a rubbing, an ink stamp and a postage stamp, on your phone. No stone is touched.",
};

export default function StampPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Stamp Kit"
        death={<Gate className="h-5 w-5" />}
        life={<Fern className="h-5 w-5" />}
        intro={
          <>
            Photograph a headstone and get a rubbing, an ink stamp and a postage stamp of it. Real rubbings wear stones
            down; this one only needs a photo.
          </>
        }
      />
      {/* Opens once you have a haunt (or the link names a cemetery); the haunt lives on the phone. */}
      <Suspense fallback={<GateNeutral />}>
        <HauntGate tool="/stamp">
          <StampKit />
        </HauntGate>
      </Suspense>
    </div>
  );
}
