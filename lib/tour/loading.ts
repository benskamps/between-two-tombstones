// The tour's loading screen, kept honest about time (review pass 4, item 1).
// Most cemeteries open in a few seconds the first time; a big one that nobody
// has opened yet can take Wikidata half a minute. The screen says so once the
// wait gets long, sooner when the link already says the cemetery is big.

import { BIG_CEMETERY_PEOPLE } from "@/lib/data/big";

/** Shown under "Gathering the stories…" from the start. */
export const LOADING_INTRO = "Asking Wikidata who’s buried here and Wikipedia how they lived. Most cemeteries take a few seconds the first time.";

/** When the extra line appears: sooner when the link says the cemetery is big, otherwise once the wait is clearly long. */
export const BIG_NOTE_AFTER_MS = 3_000;
export const SLOW_NOTE_AFTER_MS = 8_000;

const count = (n: number) => n.toLocaleString("en-US");

/** `people` is the count from the link (`n`), when there is one. */
export function slowNoteDelay(people: number | null): number {
  return people !== null && people >= BIG_CEMETERY_PEOPLE ? BIG_NOTE_AFTER_MS : SLOW_NOTE_AFTER_MS;
}

/** The line added once the wait is long. Says what we know: the size from the link, or that big ones are slow. */
export function slowLoadingNote(people: number | null): string {
  if (people !== null && people >= BIG_CEMETERY_PEOPLE) return `This cemetery is big (${count(people)} people listed), so the first load can take half a minute.`;
  if (people !== null) return "Still loading. Wikidata or Wikipedia is slow right now; the first load can take half a minute.";
  return "Still loading. A big cemetery’s first load can take half a minute.";
}

/** The longest line slowLoadingNote can return (`n` has at most 7 digits), for reserving its space so nothing moves (CLS 0). */
export const LONGEST_NOTE = [slowLoadingNote(9_999_999), slowLoadingNote(1), slowLoadingNote(null)].reduce((a, b) => (b.length > a.length ? b : a));
