// Shapes for the Gravitator deck: GET /api/gravitator returns a Deck, or a
// DeckError with a 4xx/5xx status. Every profile field except the identity,
// name and location is optional, because Wikidata coverage is thin (most
// cemeteries near Atlanta have only a name and a point).

export type NotablePerson = {
  qid: string;
  name: string;
  /** Year of death, or null when unknown. */
  deathYear: number | null;
  /** Died within 25 years, or unknown (lib/respect.ts): show the name only. */
  recent: boolean;
};

export type GraveyardProfile = {
  qid: string;
  name: string;
  /** Town or county it's in (P131), preferring a town. */
  place: string | null;
  lat: number;
  lon: number;
  /** From the deck's center, in km. The client recomputes it from the real position. */
  distanceKm: number;
  /** Commons Special:FilePath URL, https, ?width=500. */
  image: string | null;
  /** The Commons file name, for the photo credit link. */
  imageFile: string | null;
  /** P571, best rank. Precision 9 = year, 8 = decade, 7 = century. */
  established: { year: number; precision: number } | null;
  /** P2046 converted to acres and rounded. */
  acres: number | null;
  /** P1435 heritage designation labels, as Wikidata has them. */
  heritage: string[];
  /** P31 class QIDs (for the public filter). */
  typeIds: string[];
  /** P31 labels other than plain "cemetery" ("war cemetery", "churchyard"…). */
  types: string[];
  /** P2025. */
  findAGraveId: string | null;
  /** English Wikipedia article title. */
  enwiki: string | null;
  /** Plain-text Wikipedia intro, when it could be fetched. */
  bio: { intro: string; url: string } | null;
  /** People (P31 human) with P119 = this cemetery. */
  notable: { count: number; top: NotablePerson[] } | null;
};

export type DeckNoteSource = "Wikidata" | "Wikipedia";

export type Deck = {
  center: { lat: number; lon: number };
  radiusKm: number;
  fetchedAt: string;
  /** Public cemeteries found in the radius, before the deck cap. */
  total: number;
  /** How many the public filter left out. */
  excluded: number;
  cards: GraveyardProfile[];
  /** Parts that couldn't be fetched; the deck still works without them. */
  notes: { source: DeckNoteSource; message: string }[];
};

export type DeckError = {
  error: { source: "Wikidata" | "Wikipedia" | "request"; message: string };
};

export const RADII = [25, 50] as const;
export type RadiusKm = (typeof RADII)[number];
/** Largest deck we send; the rest are named in the end-of-deck line. */
export const DECK_CAP = 250;
