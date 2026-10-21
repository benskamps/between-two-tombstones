import Link from "next/link";
import { ArchFrame, SymbolPair } from "@/components/ui/Motifs";
import { Lily, RingedMoon } from "@/components/ui/symbols";
import { distanceText, nearHref, peopleText } from "@/lib/data/near";
import type { NearbyCemetery } from "@/lib/data/types";

function placeLine(c: NearbyCemetery): string {
  return [c.locatedIn, distanceText(c.distanceKm)].filter(Boolean).join(" · ");
}

/** The nearest cemetery with stories worth the walk, above the nearest-first list (F2). */
export function BestNearby({ cemetery }: { cemetery: NearbyCemetery }) {
  return (
    // An arch like the doors before it and the story cards after it, so the first walk stays carved (REVIEW-3 #6).
    <ArchFrame aria-labelledby="near-best-title" className="space-y-2 text-center" data-testid="near-best">
      <SymbolPair death={<RingedMoon className="h-5 w-5" />} life={<Lily className="h-5 w-5" />} />
      <h2 id="near-best-title" className="font-bold text-muted">
        Best stories nearby
      </h2>
      <Link href={nearHref(cemetery.qid, cemetery.burials)} className="tap block space-y-1" data-qid={cemetery.qid}>
        <span className="block font-display text-3xl leading-tight">{cemetery.name}</span>
        <span className="block text-sm text-muted">{placeLine(cemetery)}</span>
        <span className="block font-bold">{peopleText(cemetery.burials)}</span>
        <span className="btn btn-primary mt-2 w-full">Open the tour</span>
      </Link>
    </ArchFrame>
  );
}

/** Cemeteries with at least one person listed: each opens its tour. */
export function NearLinkList({ items, label }: { items: NearbyCemetery[]; label: string }) {
  return (
    <ul className="grid gap-3" aria-label={label} data-testid="cemetery-list">
      {items.map((c) => (
        <li key={c.qid}>
          <Link href={nearHref(c.qid, c.burials)} className="card tap block p-4" data-qid={c.qid}>
            <span className="font-display text-xl">{c.name}</span>
            <span className="block text-sm text-muted">{placeLine(c)}</span>
            <span className="block text-sm">{peopleText(c.burials)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cemeteries Wikidata lists nobody at, folded away as plain text: a link would
 * open an empty tour. `more` says whether anything with people is listed above.
 */
export function UnlistedFold({ items, more }: { items: NearbyCemetery[]; more: boolean }) {
  const n = items.length;
  const noun = n === 1 ? "cemetery" : "cemeteries";
  return (
    <details className="group" data-testid="near-unlisted">
      <summary className="tap flex cursor-pointer items-center rounded-xl border border-border px-4 font-bold">
        {more ? `${n} more nearby with no one listed yet` : `${n} ${noun} nearby with no one listed yet`}
      </summary>
      <div className="space-y-2 px-4 pb-4 pt-2">
        <p className="text-sm text-muted">Wikidata doesn&rsquo;t list anyone buried at these yet, so there&rsquo;s no tour for them.</p>
        <ul className="grid gap-2" aria-label="Cemeteries with no one listed yet">
          {items.map((c) => (
            <li key={c.qid} data-qid={c.qid}>
              <span className="font-bold">{c.name}</span>
              <span className="block text-sm text-muted">{placeLine(c)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
