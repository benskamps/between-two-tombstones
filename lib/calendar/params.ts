// Reading the feed URL: /api/calendar/<qid>[.ics]?kinds=death[,birth]&limit=N.
// Shared by the route and the /calendar page, so the page only ever builds
// URLs the route accepts.

import { DEFAULT_KINDS, DEFAULT_LIMIT, EVENT_KINDS, MAX_LIMIT, type EventKind } from "./kinds";

export type FeedParams = { kinds: EventKind[]; limit: number };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const QID_RE = /^Q[1-9]\d{0,11}$/;

/** "Q2008469" or "Q2008469.ics" → "Q2008469"; null for anything else. */
export function parseQidSegment(raw: string): string | null {
  const qid = raw.replace(/\.ics$/i, "");
  return QID_RE.test(qid) ? qid : null;
}

export const KINDS_MESSAGE = 'kinds must be "death", "birth" or "death,birth".';
export const LIMIT_MESSAGE = `limit must be a whole number from 1 to ${MAX_LIMIT}.`;

export function parseFeedParams(search: URLSearchParams): ParseResult<FeedParams> {
  const kindValues = search.getAll("kinds");
  const limitValues = search.getAll("limit");
  if (kindValues.length > 1) return { ok: false, message: "Give kinds only once, e.g. kinds=death,birth." };
  if (limitValues.length > 1) return { ok: false, message: "Give limit only once, e.g. limit=30." };

  let kinds: EventKind[] = [...DEFAULT_KINDS];
  if (kindValues.length === 1) {
    const parts = kindValues[0].split(",").map((k) => k.trim().toLowerCase());
    if (parts.length === 0 || parts.some((k) => !(EVENT_KINDS as readonly string[]).includes(k))) {
      return { ok: false, message: KINDS_MESSAGE };
    }
    // Feed order is always death-day, then birthday.
    kinds = EVENT_KINDS.filter((k) => parts.includes(k));
  }

  let limit = DEFAULT_LIMIT;
  if (limitValues.length === 1) {
    const raw = limitValues[0].trim();
    if (!/^\d{1,3}$/.test(raw)) return { ok: false, message: LIMIT_MESSAGE };
    limit = Number(raw);
    if (limit < 1 || limit > MAX_LIMIT) return { ok: false, message: LIMIT_MESSAGE };
  }

  return { ok: true, value: { kinds, limit } };
}

/** The feed path for these settings; defaults are left out so the common URL stays short. */
export function feedPath(qid: string, { kinds, limit }: Partial<FeedParams> = {}): string {
  const query: string[] = [];
  const k = kinds ? EVENT_KINDS.filter((x) => kinds.includes(x)) : [...DEFAULT_KINDS];
  if (k.join(",") !== DEFAULT_KINDS.join(",")) query.push(`kinds=${k.join(",")}`);
  if (limit !== undefined && limit !== DEFAULT_LIMIT) query.push(`limit=${limit}`);
  return `/api/calendar/${qid}${query.length ? `?${query.join("&")}` : ""}`;
}

export type SubscribeLinks = {
  /** https:// (or http:// locally) feed URL: the one to copy, download and give Outlook. */
  feed: string;
  apple: string;
  google: string;
  outlook: string;
};

/**
 * Subscribe links for the current origin (e.g. "https://between-two-tombstones.vercel.app").
 * Apple takes webcal://; Google takes the webcal URL as `cid`; Outlook takes the
 * http(s) URL plus a display name.
 */
export function subscribeLinks(origin: string, path: string, name: string): SubscribeLinks {
  const feed = `${origin.replace(/\/+$/, "")}${path}`;
  const webcal = feed.replace(/^https?:\/\//i, "webcal://");
  return {
    feed,
    apple: webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(name)}`,
  };
}
