import { Doors } from "@/components/haunt/Doors";
import { FamousCemeteries } from "@/components/haunt/Famous";
import { HauntReturn } from "@/components/haunt/HauntReturn";
import { OrbitDivider } from "@/components/ui/Motifs";

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="space-y-2 text-center">
        <h1 className="font-display text-3xl leading-tight">Who&rsquo;s buried here, and how did they live?</h1>
        <p className="text-muted">We find the graves with the best stories.</p>
      </section>

      <HauntReturn when="fresh" />

      <Doors />

      <HauntReturn when="stale" />

      <OrbitDivider />

      <FamousCemeteries />
    </div>
  );
}
