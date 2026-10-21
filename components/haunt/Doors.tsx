import Link from "next/link";
import { NearMeButton } from "@/components/shell/NearMeButton";
import { SearchForm } from "@/components/tour/SearchForm";
import { ArchFrame, SymbolPair } from "@/components/ui/Motifs";
import { Candle, Lily, Moth, RingedMoon } from "@/components/ui/symbols";

/**
 * The two ways in (decision 18, revised by Ben 10/21): find a graveyard, by
 * location or by name, or plan a date with the Gravitator. Used on the home
 * page and wherever a tool needs a haunt first. `level` is the heading level of
 * each door's title, so the doors fit under whatever heading the page has.
 */
export function Doors({ idPrefix = "door", level = 2 }: { idPrefix?: string; level?: 2 | 3 }) {
  const H = `h${level}` as const;
  return (
    <div className="grid gap-6" data-testid="doors">
      <ArchFrame aria-labelledby={`${idPrefix}-search`} className="space-y-4 text-center">
        <SymbolPair death={<RingedMoon className="h-7 w-7" />} life={<Lily className="h-7 w-7" />} />
        <H id={`${idPrefix}-search`} className="font-display text-3xl leading-tight">
          Search a graveyard
        </H>
        <NearMeButton label="I’m here. Haunt me." hint="Uses your location" />
        <div className="text-left">
          <SearchForm idPrefix={idPrefix} placeholder="e.g. Oakland Cemetery" label="Or type the cemetery’s name" />
        </div>
      </ArchFrame>

      <ArchFrame aria-labelledby={`${idPrefix}-date`} className="space-y-4 text-center">
        <SymbolPair death={<Moth className="h-7 w-7" />} life={<Candle animate className="h-7 w-7" />} />
        <H id={`${idPrefix}-date`} className="font-display text-3xl leading-tight">
          Plan a date
        </H>
        <p className="text-muted">
          The Gravitator: swipe through the public cemeteries near you, save the ones you like, and pick one to visit.
        </p>
        <Link href="/gravitator" className="btn btn-candle w-full">
          Open the Gravitator
        </Link>
      </ArchFrame>
    </div>
  );
}
