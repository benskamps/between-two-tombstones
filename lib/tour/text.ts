// Tidy the plain-text Wikipedia intros the extracts API sends. `explaintext`
// leaves debris where templates were: the hidden ISO date of {{birth date}}
// ("((1832-02-06)February 6, 1832") and the "(; " left by a removed
// pronunciation. Runs where extracts are parsed (new data) and again when a
// card renders, because cached and downloaded tours keep the old text.

/** The hidden microformat date inside {{birth date}} / {{death date}}: "(1832-02-06)". */
const MICROFORMAT_DATE = /\(\d{4}-\d{2}-\d{2}\)/g;
/** "(" followed by a separator left by something removed: "(; July 19" → "(July 19". */
const OPEN_THEN_SEPARATOR = /\([ \t ]*[;,][ \t ]*/g;
/** Spaces just inside a parenthesis, left by stripping. Never newlines: they split paragraphs. */
const SPACE_AFTER_OPEN = /\([ \t ]+/g;
const SPACE_BEFORE_CLOSE = /[ \t ]+\)/g;
const EMPTY_PARENS = /\([ \t ]*\)/g;
const SPACE_BEFORE_COMMA = /[ \t ]+,/g;
const DOUBLE_SPACES = /[ \t ]{2,}/g;

export function cleanExtract(text: string): string {
  if (!text) return text;
  let t = text.replace(MICROFORMAT_DATE, "");
  // Stripping "(1832-02-06)" from "((1832-02-06)February" already leaves one "(".
  t = t.replace(OPEN_THEN_SEPARATOR, "(").replace(SPACE_AFTER_OPEN, "(").replace(SPACE_BEFORE_CLOSE, ")");
  // Twice: removing "()" can expose another one, as in "(())".
  t = t.replace(EMPTY_PARENS, "").replace(EMPTY_PARENS, "");
  t = t.replace(DOUBLE_SPACES, " ").replace(SPACE_BEFORE_COMMA, ",");
  return t
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
}

// ---------------------------------------------------------------- names

/**
 * True when a "name" is really an ID, or missing. With no English label,
 * Wikidata's label service answers with the QID ("Q16162799"): no name to
 * carve on a card, put in a calendar or speak in the spirit box.
 */
export function isQidName(name: string | null | undefined): boolean {
  return !name || !name.trim() || /^Q\d+$/.test(name.trim());
}

/** An English Wikipedia title as a name: "Nedom L. Angier (politician)" → "Nedom L. Angier". */
export function nameFromWikiTitle(title: string | null | undefined): string | null {
  const t = (title ?? "").replaceAll("_", " ").replace(/\s*\([^()]*\)\s*$/, "").trim();
  return isQidName(t) ? null : t;
}

/**
 * The name to show for a person: the Wikidata label, unless it's a bare QID;
 * then the English Wikipedia title without its disambiguator; null when
 * neither exists (the person leaves the list).
 */
export function personName(label: string | null | undefined, wikiTitle: string | null | undefined): string | null {
  if (!isQidName(label)) return label!;
  return nameFromWikiTitle(wikiTitle);
}
