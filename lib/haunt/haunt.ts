// The haunt (decision 18e): the cemetery you picked. Opening a cemetery page
// makes it your haunt; tool pages follow it. It's kept on the phone only
// (localStorage "btt-haunt"); nothing about it reaches a server.
//
// Pure helpers only: no window, no React. lib/haunt/store.ts does the storage.

export const HAUNT_KEY = "btt-haunt";
/** Fired on window after this tab changes the haunt (the storage event only reaches other tabs). */
export const HAUNT_EVENT = "btt-haunt-change";

export type Haunt = {
  qid: string;
  name: string;
  place?: string;
  /** ISO time it was last set. */
  at: string;
  /** Picked with the Ghost pass: you're here in spirit, not at the gate. */
  ghost?: true;
};

export type HauntInput = { qid: string; name: string; place?: string | null; ghost?: boolean };

/**
 * A cemetery named in a page's address: only its ID (?cemetery=Q…). A link's
 * ?name= and ?place= are whatever its sender typed, so they are never read
 * (K2): names come from VERIFIED_SAMPLES or from our own data.
 */
export type UrlCemetery = { qid: string };

/** The sample cemeteries' names, from their snapshots: known without asking anyone. */
export const VERIFIED_SAMPLES: readonly HauntInput[] = [
  { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta, Georgia" },
  { qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow, New York" },
];

/**
 * The Ghost pass: for anyone with no graveyard nearby (judges at home, mostly).
 * Sleepy Hollow, because the Stamp Kit's sample headstone is Washington Irving's.
 */
export const GHOST_PASS: HauntInput = { qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow, New York", ghost: true };

const QID_RE = /^Q[1-9]\d{0,11}$/;
/** A haunt is fresh for 12 hours (F10): after that, it's "last time", not "now". */
export const FRESH_MS = 12 * 60 * 60 * 1000;
export const MAX_NAME = 120;
export const MAX_PLACE = 80;

export function isQid(v: unknown): v is string {
  return typeof v === "string" && QID_RE.test(v);
}

/** Trimmed, whitespace collapsed, control characters dropped, capped; undefined when empty. */
export function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return s || undefined;
}

export function makeHaunt(input: HauntInput, now: Date = new Date()): Haunt | null {
  const qid = typeof input.qid === "string" ? input.qid.trim().toUpperCase() : "";
  const name = cleanText(input.name, MAX_NAME);
  if (!isQid(qid) || !name) return null;
  const place = cleanText(input.place, MAX_PLACE);
  return { qid, name, ...(place ? { place } : {}), at: now.toISOString(), ...(input.ghost ? { ghost: true as const } : {}) };
}

/** Set within the last 12 hours (and not in the future by more than a minute of clock skew). */
export function isFresh(h: Pick<Haunt, "at">, now: number = Date.now()): boolean {
  const t = Date.parse(h.at);
  if (Number.isNaN(t)) return false;
  return now - t < FRESH_MS && t - now < 60_000;
}

/**
 * Should opening this cemetery's page make it the haunt (F11)? Yes when the
 * visitor came from "I'm here" or the nearby list, when there's no fresh haunt,
 * or when it already is the haunt (that refreshes it). Otherwise the page
 * offers "Make this my haunt" instead of switching on its own.
 */
export function shouldAutoSetHaunt(qid: string, fresh: Haunt | null, via: string | null): boolean {
  if (via === "here" || via === "near") return true;
  return !fresh || fresh.qid === qid;
}

/** Where a gate sends you back to once you have a haunt: only our own tool pages. */
export const NEXT_TOOLS: Record<string, string> = {
  "/stamp": "the Stamp Kit",
  "/spirit": "the Spirit Box",
  "/games": "the Graveyard Games",
  "/games/bingo": "Tombstone Bingo",
  "/games/party": "the Graveyard Party",
  "/games/evp": "the EVP Recorder",
  "/games/stonemath": "Stone Math",
  "/games/whoami": "Who Am I?",
  "/p": "your Graveyard Passport",
  "/calendar": "the Haunted Calendar",
};

export function parseNext(raw: string | null | undefined): string | null {
  return raw && Object.hasOwn(NEXT_TOOLS, raw) ? raw : null;
}

/** Reads what's stored; anything malformed (or from another app) is no haunt. */
export function parseHaunt(raw: string | null | undefined): Haunt | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const at = typeof o.at === "string" && !Number.isNaN(Date.parse(o.at)) ? o.at : null;
  if (!at || typeof o.qid !== "string" || typeof o.name !== "string") return null;
  const h = makeHaunt({ qid: o.qid, name: o.name, place: typeof o.place === "string" ? o.place : undefined, ghost: o.ghost === true });
  return h ? { ...h, at } : null;
}

export function serializeHaunt(h: Haunt): string {
  return JSON.stringify({ qid: h.qid, name: h.name, ...(h.place ? { place: h.place } : {}), at: h.at, ...(h.ghost ? { ghost: true } : {}) });
}

/** The cemetery a page's address names, if its QID is well formed. Its ?name= and ?place= are ignored (K2). */
export function cemeteryFromParams(get: (name: string) => string | null): UrlCemetery | null {
  const qid = get("cemetery")?.trim().toUpperCase() ?? "";
  return isQid(qid) ? { qid } : null;
}

/**
 * The haunt a URL cemetery should become, named only from what the app already
 * knows (the samples, or `known`); null otherwise, and the name is looked up
 * from our own data first (HauntGate, the spirit box, the hub).
 */
export function hauntInputFromUrl(url: UrlCemetery, known: readonly HauntInput[] = []): HauntInput | null {
  const k = known.find((c) => c.qid === url.qid) ?? VERIFIED_SAMPLES.find((c) => c.qid === url.qid);
  if (!k) return null;
  return { qid: url.qid, name: k.name, place: k.place ?? undefined };
}

/** A link someone sent (a séance, a party room…): the page names it in one of these parameters. */
export function isShareLink(get: (name: string) => string | null, shareParams: readonly string[]): boolean {
  return shareParams.some((p) => get(p) !== null);
}

export type GateState = "unknown" | "open" | "pick";

/**
 * Whether a tool page opens:
 * - a link someone sent always opens (never gate a share);
 * - a cemetery in the address opens (and becomes the haunt);
 * - otherwise the haunt decides; `undefined` means it isn't known yet (server render).
 */
export function gateState({
  shareLink,
  urlCemetery,
  haunt,
}: {
  shareLink: boolean;
  urlCemetery: UrlCemetery | null;
  haunt: Haunt | null | undefined;
}): GateState {
  if (shareLink || urlCemetery) return "open";
  if (haunt === undefined) return "unknown";
  return haunt ? "open" : "pick";
}

/** The query string that carries a cemetery to a tool (?cemetery=Q…&name=…&place=…). */
export function cemeteryQuery(c: HauntInput, withName = true): string {
  const q = new URLSearchParams({ cemetery: c.qid });
  if (withName) {
    const name = cleanText(c.name, MAX_NAME);
    const place = cleanText(c.place, MAX_PLACE);
    if (name) q.set("name", name);
    if (place) q.set("place", place);
  }
  return q.toString();
}

/** The haunt's hub. */
export function hubHref(h: { qid: string }): string {
  return `/cemetery/${h.qid}`;
}
