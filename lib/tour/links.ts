// Outbound links only (decision 2): Find a Grave from P535/P2025 with a
// name-search fallback, and Commons thumbnails. Never scraped.
import type { Person } from "@/lib/types";
import { parseWikiDate } from "./dates";

export function findAGraveMemorialUrl(id: string): string {
  return `https://www.findagrave.com/memorial/${encodeURIComponent(id)}`;
}

export function findAGraveCemeteryUrl(id: string): string {
  return `https://www.findagrave.com/cemetery/${encodeURIComponent(id)}`;
}

/** Find a Grave's public memorial search, by first and last name (and death year when known). */
export function findAGraveSearchUrl(p: Pick<Person, "name" | "death" | "deathPrecision">): string {
  const parts = p.name.replace(/\s*\(.*?\)\s*/g, " ").replace(/,?\s+(Jr\.?|Sr\.?|I{2,3}|IV)$/i, "").trim().split(/\s+/);
  const lastname = parts.length > 1 ? parts[parts.length - 1] : parts[0] ?? "";
  const firstname = parts.length > 1 ? parts[0] : "";
  const params = new URLSearchParams({ firstname, lastname });
  const d = parseWikiDate(p.death, p.deathPrecision);
  if (d && d.precision >= 9 && d.year > 0) params.set("deathyear", String(d.year));
  return `https://www.findagrave.com/memorial/search?${params}`;
}

export function findAGraveUrl(p: Pick<Person, "name" | "death" | "deathPrecision" | "findAGraveId">): { url: string; kind: "memorial" | "search" } {
  return p.findAGraveId
    ? { url: findAGraveMemorialUrl(p.findAGraveId), kind: "memorial" }
    : { url: findAGraveSearchUrl(p), kind: "search" };
}

/**
 * Wikimedia only serves thumbnails at its standard widths without rate-limiting
 * (others got 429 "use thumbnail images in sizes listed on w.wiki/GHai").
 */
export const THUMB_WIDTHS = [120, 250, 330, 500, 960] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];
/** Story-card photo width. */
export const CARD_PHOTO_WIDTH: ThumbWidth = 500;
/** Small photo width. */
export const SMALL_PHOTO_WIDTH: ThumbWidth = 330;

/**
 * Wikidata gives "http://commons.wikimedia.org/wiki/Special:FilePath/<file>".
 * Return the https thumbnail URL at a standard `width` (Commons redirects to a
 * scaled copy on thumb.wikimedia.org). Always https: the CSP blocks http.
 */
export function commonsThumb(url: string | null, width: ThumbWidth = CARD_PHOTO_WIDTH): string | null {
  if (!url) return null;
  const m = url.match(/^(?:https?:)?\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/([^?#]+)/);
  if (!m) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${m[1]}?width=${width}`;
}

/** Any Wikimedia URL from the data, forced to https. */
export function httpsUrl(url: string | null): string | null {
  return url ? url.replace(/^http:\/\//, "https://") : null;
}

/** The Commons file page, for photo credit. */
export function commonsFilePage(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/Special:FilePath\/(.+)$/);
  return m ? `https://commons.wikimedia.org/wiki/File:${m[1]}` : null;
}
