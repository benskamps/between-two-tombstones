import { Doors } from "@/components/haunt/Doors";
import { FamousCemeteries } from "@/components/haunt/Famous";
import { HauntReturn } from "@/components/haunt/HauntReturn";
import { HomeShowcase, InstantHauntRibbon } from "@/components/home/HomeShowcase";
import { FenceDivider, OrbitDivider } from "@/components/ui/Motifs";

export default function Home() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="space-y-1.5 text-center">
        <h1 className="font-display text-[1.75rem] leading-tight sm:text-3xl">
          Who&rsquo;s buried here, and how did they live?
        </h1>
        <p className="text-sm text-muted sm:text-base">
          Every stone hides a life. Walk any graveyard—or step into a famous one right from your couch.
        </p>
        <InstantHauntRibbon />
      </section>

      <HauntReturn when="fresh" />

      <Doors />

      <HauntReturn when="stale" />

      <OrbitDivider />

      <HomeShowcase />

      <FenceDivider />

      <FamousCemeteries />
    </div>
  );
}
