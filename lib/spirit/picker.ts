// The picker row for a cemetery that isn't one of the samples (the spirit box,
// the party's séance): its name in bold and, under it, where it came from.
// Never an ID for a name, never "your last tour" for a link (review 4, #3), and
// never the link's own ?name= or ?place=: a stranger typed those (K2).

/** A Wikidata ID such as "Q216344": an address, not a name. */
const ID_RE = /^Q\d+$/i;

export type CemeteryOption = { label: string; detail: string };

/** For a cemetery from a link whose name we haven't verified (yet). */
export const LINK_FALLBACK = "The cemetery in your link";

/** The name, trimmed; null when there is none or it is only an ID. */
export function usableName(name: string | null | undefined): string | null {
  const n = name?.trim();
  return n && !ID_RE.test(n) ? n : null;
}

/**
 * - `loaded`: the name its burials came back with (Wikidata's label, or a
 *   sample's saved copy): verified.
 * - `haunt`: the fresh haunt, when it is this cemetery (named from our data).
 * - `fromLink`: the cemetery came in the page's address.
 * Your haunt says so even when the link also names it (the hub's own tools
 * carry it); otherwise a cemetery from the address is "From your link".
 */
export function extraCemeteryOption({
  loaded,
  haunt,
  fromLink,
}: {
  loaded?: string | null;
  haunt?: { name: string; place?: string | null } | null;
  fromLink: boolean;
}): CemeteryOption {
  const origin = haunt || !fromLink ? "Your haunt" : "From your link";
  const name = usableName(loaded) ?? usableName(haunt?.name);
  const place = haunt?.place?.trim() || null;
  if (!name) return { label: haunt || !fromLink ? "Your haunt" : LINK_FALLBACK, detail: place ?? origin };
  return { label: name, detail: place ? `${origin} · ${place}` : origin };
}
