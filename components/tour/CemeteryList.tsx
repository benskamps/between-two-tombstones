import Link from "next/link";
import type { CemeterySearchResult, NearbyCemetery, OsmOnlyCemetery } from "@/lib/data/types";

type Item = (NearbyCemetery | CemeterySearchResult) & { distanceKm?: number; region?: string | null };

function km(d: number): string {
  return d < 1 ? `${Math.round(d * 1000 / 10) * 10} m away` : `${d.toFixed(1)} km away`;
}

function burialsText(n: number): string {
  if (n === 0) return "No burials listed on Wikidata yet";
  return `${n} ${n === 1 ? "person" : "people"} listed on Wikidata`;
}

/** Cemeteries with Wikidata entries; each opens its tour. */
export function CemeteryList({ items, label }: { items: Item[]; label: string }) {
  return (
    <ul className="grid gap-3" aria-label={label} data-testid="cemetery-list">
      {items.map((c) => {
        const place = [c.locatedIn, c.region].filter(Boolean).join(", ");
        return (
          <li key={c.qid}>
            <Link href={`/cemetery/${c.qid}`} className="tap block rounded-xl border border-border bg-surface p-4">
              <span className="font-display text-xl">{c.name}</span>
              <span className="block text-sm text-muted">
                {[place || null, c.distanceKm !== undefined ? km(c.distanceKm) : null].filter(Boolean).join(" · ")}
              </span>
              <span className={`block text-sm ${c.burials > 0 ? "text-accent" : "text-muted"}`}>{burialsText(c.burials)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Cemeteries only OpenStreetMap knows: no tour, but worth knowing they're there. */
export function OsmOnlyList({ items }: { items: OsmOnlyCemetery[] }) {
  return (
    <ul className="grid gap-2" aria-label="Also mapped on OpenStreetMap">
      {items.map((c) => (
        <li key={c.osmId} className="rounded-xl border border-border px-4 py-2">
          <span className="font-bold">{c.name}</span>
          <span className="block text-sm text-muted">
            {km(c.distanceKm)} ·{" "}
            <a className="underline" href={`https://www.openstreetmap.org/${c.osmId}`} target="_blank" rel="noopener noreferrer">
              View on OpenStreetMap
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}
