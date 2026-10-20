// Builds one Gravitator deck: one profiles SPARQL, one burials SPARQL, then
// batched Wikipedia intros (20 titles per request, PLAN.md decision 10).
//
// Only the profiles query is required. If it fails, buildDeck throws and the
// route names Wikidata; nothing is cached. If the burials query or Wikipedia
// fails, the deck still comes back, with a note saying what's missing, and the
// cached copy is kept for minutes instead of a day (lib/gravitator/cached.ts).

import { burialsQuery, profilesQuery } from "./sparql";
import {
  compareProfiles,
  parseBurials,
  parseExtracts,
  parseProfiles,
  type ExtractsJson,
  type ProfileRow,
  type SparqlJson,
} from "./parse";
import { DECK_CAP, type Deck, type GraveyardProfile } from "./types";

export type DeckFetcher = {
  /** Runs a SPARQL query on query.wikidata.org. POST for long queries. */
  sparql(query: string, method: "GET" | "POST"): Promise<SparqlJson>;
  /** One batched TextExtracts request for up to 20 titles. */
  extracts(titles: string[]): Promise<ExtractsJson>;
};

export class DeckSourceError extends Error {
  readonly source: "Wikidata";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DeckSourceError";
    this.source = "Wikidata";
  }
}

export const WIKIPEDIA_BATCH = 20;
/** At most this many Wikipedia requests per deck (60 bios); later cards go without. */
export const WIKIPEDIA_MAX_BATCHES = 3;

export const NOTE_BURIALS = "Couldn't load notable burials from Wikidata, so cards show the places only.";
export const NOTE_WIKIPEDIA = "Couldn't reach Wikipedia, so some bios are missing. Try again in a minute.";

/** Drop the filter-only fields before a row becomes a card. */
function strip(row: ProfileRow): Omit<GraveyardProfile, "bio" | "notable"> {
  const copy: Partial<ProfileRow> = { ...row };
  delete copy.nonPublic;
  delete copy.dissolved;
  return copy as Omit<GraveyardProfile, "bio" | "notable">;
}

export async function buildDeck(
  center: { lat: number; lon: number },
  radiusKm: number,
  fetcher: DeckFetcher,
  now = new Date(),
): Promise<Deck> {
  let profilesJson: SparqlJson;
  try {
    profilesJson = await fetcher.sparql(profilesQuery(center.lat, center.lon, radiusKm), "GET");
  } catch (err) {
    throw new DeckSourceError("Couldn't reach Wikidata. Try again in a minute.", { cause: err });
  }
  if (!profilesJson?.results?.bindings) throw new DeckSourceError("Wikidata sent an answer we couldn't read.");

  const { rows, excluded } = parseProfiles(profilesJson, now);
  const notes: Deck["notes"] = [];
  const base: Deck = {
    center,
    radiusKm,
    fetchedAt: now.toISOString(),
    total: rows.length,
    excluded,
    cards: [],
    notes,
  };
  if (rows.length === 0) return base;

  let burials: ReturnType<typeof parseBurials> | null = null;
  try {
    burials = parseBurials(await fetcher.sparql(burialsQuery(rows.map((r) => r.qid)), "POST"), now);
  } catch {
    notes.push({ source: "Wikidata", message: NOTE_BURIALS });
  }

  const cards: GraveyardProfile[] = rows
    .map((r) => ({
      ...strip(r),
      bio: null,
      // Without the burials answer we don't know the count: null, not zero.
      notable: burials ? (burials.get(r.qid) ?? { count: 0, top: [] }) : null,
    }))
    .sort(compareProfiles)
    .slice(0, DECK_CAP);

  const titles = [...new Set(cards.map((c) => c.enwiki).filter((t): t is string => !!t))];
  const bios = new Map<string, { intro: string; url: string }>();
  for (let i = 0; i < titles.length && i < WIKIPEDIA_BATCH * WIKIPEDIA_MAX_BATCHES; i += WIKIPEDIA_BATCH) {
    const batch = titles.slice(i, i + WIKIPEDIA_BATCH);
    try {
      for (const [t, bio] of parseExtracts(await fetcher.extracts(batch), batch)) bios.set(t, bio);
    } catch {
      // Don't keep knocking on a rate-limited door: the rest go without bios.
      notes.push({ source: "Wikipedia", message: NOTE_WIKIPEDIA });
      break;
    }
  }
  for (const c of cards) {
    const bio = c.enwiki ? bios.get(c.enwiki) : undefined;
    if (bio) c.bio = bio;
  }
  return { ...base, cards };
}
