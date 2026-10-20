import type { Cemetery } from "@/lib/types";
import { findAGraveCemeteryUrl, httpsUrl } from "@/lib/tour/links";

/** Matches BURIALS_LIMIT in lib/data/wikidata.ts (kept literal so no server code ships to the browser). */
const BURIALS_CAP = 80;

export function TourHeader({ cemetery, people }: { cemetery: Cemetery; people: number }) {
  return (
    <header className="space-y-2">
      <h1 className="font-display text-4xl leading-tight">{cemetery.name}</h1>
      {(cemetery.locatedIn || cemetery.description) && (
        <p className="text-muted">{[cemetery.locatedIn, cemetery.description].filter(Boolean).join(" · ")}</p>
      )}
      <p className="text-sm">
        {people >= BURIALS_CAP
          ? `The ${people} best-known people buried here, from Wikidata.`
          : `${people} ${people === 1 ? "person" : "people"} buried here, from Wikidata.`}
      </p>
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
    </header>
  );
}
