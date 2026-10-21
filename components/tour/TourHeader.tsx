import type { ReactNode } from "react";
import type { Cemetery } from "@/lib/types";
import { findAGraveCemeteryUrl, httpsUrl } from "@/lib/tour/links";

// The hub's header stays short so the stories start on the first screen (F1).
// The tools moved to the haunt's toolkit (components/haunt/HauntToolkit.tsx)
// and the outside links to the foot of the tour (TourLinks).

/** Matches BURIALS_LIMIT in lib/data/wikidata.ts (kept literal so no server code ships to the browser). */
const BURIALS_CAP = 80;

/**
 * "Atlanta · cemetery in Atlanta, Georgia, USA" says the place twice: keep the
 * longer one. Wikidata descriptions start lowercase; the line starts with a capital (N11).
 */
export function placeLine(locatedIn: string | null, description: string | null): string | null {
  const place = locatedIn?.trim() || null;
  const desc = description?.trim() || null;
  const line = place && desc && desc.toLowerCase().includes(place.toLowerCase()) ? desc : [place, desc].filter(Boolean).join(" · ");
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : null;
}

export function TourHeader({ cemetery, people, children }: { cemetery: Cemetery; people: number; children?: ReactNode }) {
  const meta = placeLine(cemetery.locatedIn, cemetery.description);
  return (
    <header className="space-y-1">
      <h1 className="font-display text-4xl leading-tight">{cemetery.name}</h1>
      {meta && <p>{meta}</p>}
      <p className="text-sm text-muted">
        {people >= BURIALS_CAP
          ? `The ${people} best-known people buried here, from Wikidata.`
          : `${people} ${people === 1 ? "person" : "people"} buried here, from Wikidata.`}
      </p>
      {children}
    </header>
  );
}

/** Find a Grave and Wikipedia for the cemetery itself, at the foot of the tour. */
export function TourLinks({ cemetery }: { cemetery: Cemetery }) {
  if (!cemetery.findAGraveCemeteryId && !cemetery.enwiki) return null;
  return (
    <p className="flex flex-wrap gap-x-4 text-sm">
      {cemetery.findAGraveCemeteryId && (
        <a
          href={findAGraveCemeteryUrl(cemetery.findAGraveCemeteryId)}
          className="tap inline-flex items-center underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Find a Grave cemetery page
        </a>
      )}
      {cemetery.enwiki && (
        <a href={httpsUrl(cemetery.enwiki)!} className="tap inline-flex items-center underline" target="_blank" rel="noopener noreferrer">
          About this cemetery on Wikipedia
        </a>
      )}
    </p>
  );
}
