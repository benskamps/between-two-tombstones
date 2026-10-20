import type { Metadata } from "next";
import { Suspense } from "react";
import { Gravitator } from "@/components/gravitator/Gravitator";

export const metadata: Metadata = {
  title: "Gravitator",
  description:
    "A swipe deck of the public cemeteries near you. Save the ones you like, pass on the rest, or start a tour now.",
};

export default function GravitatorPage() {
  return (
    // The place comes from ?lat&lon, read in the browser.
    <Suspense fallback={<p className="text-(--g-muted)">Opening the Gravitator…</p>}>
      <Gravitator />
    </Suspense>
  );
}
