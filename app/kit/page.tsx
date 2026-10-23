import type { Metadata } from "next";
import { KitView } from "@/components/haunt/KitView";
import { PageHeader } from "@/components/ui/Motifs";
import { Candle } from "@/components/ui/symbols";

export const metadata: Metadata = {
  title: "Field kit",
  description:
    "The tools for the graveyard you picked: a Stamp Kit, a Spirit Box, a séance across phones, Tombstone Bingo and more. No graveyard nearby? Take the Ghost pass.",
};

export default function KitPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Field kit"
        tool="haunt"
        life={<Candle className="h-5 w-5" />}
        intro={<>Stamps, spirits, a séance and games, for the graveyard you&rsquo;re in.</>}
      />
      {/* The haunt lives on the phone, so the kit locks or opens once it's read there. */}
      <KitView />
    </div>
  );
}
