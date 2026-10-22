// The picker row for a cemetery that isn't one of the samples (the spirit box,
// the party's séance): its name in bold and, under it, where it came from.
// Never an ID for a name, and never "your last tour" for a link (review 4, #3).

/** A Wikidata ID such as "Q216344": an address, not a name. */
const ID_RE = /^Q\d+$/i;

export type CemeteryOption = { label: string; detail: string };

/** For a link with no usable name, before (or instead of) its burials loading. */
export const LINK_FALLBACK = "The cemetery in your link";

/** The name, trimmed; null when there is none or it is only an ID. */
export function usableName(name: string | null | undefined): string | null {
  const n = name?.trim();
  return n && !ID_RE.test(n) ? n : null;
}

/**
 * - `loaded`: the name from its burials, once they arrive (the best source).
 * - `link`: ?name= and ?place= when the cemetery came in the page's address.
 * - `haunt`: the fresh haunt, when it is this cemetery.
 * Your haunt says so even when the link also names it (the hub's own tools
 * carry it); otherwise a cemetery from the address is "From your link".
 */
export function extraCemeteryOption({
  loaded,
  link,
  haunt,
}: {
  loaded?: string | null;
  link?: { name?: string | null; place?: string | null } | null;
  haunt?: { name: string; place?: string | null } | null;
}): CemeteryOption {
  const origin = haunt ? "Your haunt" : "From your link";
  const name = usableName(loaded) ?? usableName(link?.name) ?? usableName(haunt?.name);
  const place = link?.place?.trim() || haunt?.place?.trim() || null;
  if (!name) return { label: haunt ? "Your haunt" : LINK_FALLBACK, detail: place ?? origin };
  return { label: name, detail: place ? `${origin} · ${place}` : origin };
}
