// A big cemetery whose burials query timed out (review pass 2, N1): the tour
// page retries once from the browser and says why it's slow. Pure text and
// parsing, shared by the server page and the client retry.

import type { DataSource, FailureKind } from "./errors";

/** At or above this many people listed, a timeout is put down to the cemetery's size. */
export const BIG_CEMETERY_PEOPLE = 200;
/** The browser's one retry waits at most this long (the API's own budget is 35 s). */
export const RETRY_TIMEOUT_MS = 45_000;
/** After a successful retry, the page re-renders from the cache; if it still hasn't after this long, say so. */
export const OPENING_TIMEOUT_MS = 20_000;

/** Only a Wikidata timeout gets the retry: an outage keeps its own copy (Gate 8). */
export function isSlowFailure(source: DataSource, kind: FailureKind): boolean {
  return source === "Wikidata" && kind === "timeout";
}

/** `n` on a tour link: how many people the near list said are listed there. */
export function parsePeopleParam(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !/^\d{1,7}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

const count = (n: number) => n.toLocaleString("en-US");
const isBig = (people: number | null) => people === null || people >= BIG_CEMETERY_PEOPLE;

/** Shown while the browser asks once more. */
export function stillLoadingText(people: number | null): string {
  if (people !== null && people >= BIG_CEMETERY_PEOPLE) return `Still loading. This cemetery is big (${count(people)} people listed).`;
  if (people === null) return "Still loading. Big cemeteries can take Wikidata a while, so we're asking once more.";
  return "Still loading. Wikidata was slow to answer, so we're asking once more.";
}

/** The failure after the retry also timed out. Big (or size unknown): say it's the size, not an outage. */
export function slowFailure(people: number | null): { title: string; message: string } {
  if (isBig(people)) {
    return { title: "This cemetery is big", message: "This cemetery is big and Wikidata didn't answer in time. Try again in a minute." };
  }
  return { title: "Wikidata didn't answer in time", message: "Wikidata took too long to answer. Try again in a minute, or open a saved tour." };
}
