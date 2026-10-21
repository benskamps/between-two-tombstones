import { HourglassSprout } from "@/components/ui/symbols";
import { Doors } from "./Doors";
import { FamousCemeteries } from "./Famous";

/**
 * What a tool page shows without a haunt: say why, then the ways in. Never a
 * dead end, never an empty page.
 */
export function PickHauntFirst({ tool }: { tool: string }) {
  return (
    <section aria-labelledby="pick-haunt" className="space-y-6" data-testid="pick-haunt">
      <div className="card bezel space-y-2 px-5 py-6 text-center">
        <HourglassSprout className="mx-auto h-8 w-8 text-lichen" />
        <h2 id="pick-haunt" className="font-display text-3xl leading-tight">
          Pick a haunt first
        </h2>
        <p className="text-muted">
          The {tool} works with the cemetery you&rsquo;re visiting. Find it below; every tool follows it from then on.
        </p>
      </div>
      <Doors idPrefix="gate" level={3} />
      <FamousCemeteries id="gate-famous" />
    </section>
  );
}

/** Holds the space while the haunt is read on the phone (the server can't know it). */
export function GateNeutral() {
  return <div aria-busy="true" className="min-h-[60svh]" />;
}
