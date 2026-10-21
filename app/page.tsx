import { Doors } from "@/components/haunt/Doors";
import { FamousCemeteries } from "@/components/haunt/Famous";
import { HauntReturn } from "@/components/haunt/HauntReturn";
import { FenceDivider, OrbitDivider } from "@/components/ui/Motifs";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3 pt-2 text-center">
        <h1 className="font-display text-4xl leading-tight">Who&rsquo;s buried here, and how did they live?</h1>
        <p className="text-muted">Pick a cemetery. We find the graves with the best stories and walk you through them.</p>
      </section>

      <HauntReturn when="fresh" />

      <Doors />

      <HauntReturn when="stale" />

      <OrbitDivider />

      <FamousCemeteries />

      <FenceDivider className="opacity-70" />
    </div>
  );
}
