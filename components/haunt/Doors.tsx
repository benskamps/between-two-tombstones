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
    // Compact enough that both doors' buttons sit above the fold on a Pixel 7 (REVIEW-2 N4).
    <div className="grid gap-3" data-testid="doors">
      <ArchFrame aria-labelledby={`${idPrefix}-search`} className="space-y-2.5 !px-4 !pb-3.5 !pt-4 text-center">
        <SymbolPair death={<RingedMoon className="h-6 w-6" />} life={<Lily className="h-6 w-6" />} />
        <H id={`${idPrefix}-search`} className="font-display text-2xl leading-tight sm:text-3xl">
          Search a graveyard
        </H>
        <NearMeButton label="I’m here. Haunt me." hint="Uses your location" fallbackFieldId={`${idPrefix}-q`} yieldToHaunt />
        <div className="text-left">
          <SearchForm idPrefix={idPrefix} placeholder="e.g. Oakland Cemetery" label="Or type the cemetery’s name" />
        </div>
      </ArchFrame>

      <ArchFrame aria-labelledby={`${idPrefix}-date`} className="space-y-2 !px-4 !pb-3.5 !pt-4 text-center">
        <SymbolPair death={<Moth className="h-6 w-6" />} life={<Candle animate className="h-6 w-6" />} />
        <H id={`${idPrefix}-date`} className="font-display text-2xl leading-tight sm:text-3xl">
          Plan a date
        </H>
        <p className="text-sm text-muted">Swipe through the cemeteries near you and save tonight&rsquo;s walk.</p>
        <Link href="/gravitator" className="btn btn-candle w-full">
          Open the Gravitator
        </Link>
      </ArchFrame>
    </div>
  );
}
