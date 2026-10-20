import type { Metadata } from "next";
import { StampKit } from "@/components/stamp/StampKit";

export const metadata: Metadata = {
  title: "Stamp Kit",
  description:
    "Turn a photo of a headstone into a rubbing, an ink stamp and a postage stamp, on your phone. No stone is touched.",
};

export default function StampPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Stamp Kit</h1>
        <p className="text-muted">
          Photograph a headstone and get a rubbing, an ink stamp and a postage stamp of it. Real rubbings wear stones
          down; this one only needs a photo.
        </p>
      </header>
      <StampKit />
    </div>
  );
}
