// Share links (L5.2, gate 6). A link carries only Wikidata IDs and a room code;
// the page and its card are drawn from the same data the tour uses, so our
// domain never shows words a stranger typed. Pure: the browser, the pages and
// the tests share it.
//
//   /s/stop/<cemeteryQid>/<personQid>   one stop on a cemetery's tour
//   /s/tour/<cemeteryQid>               a cemetery's tour
//   /s/seance/<cemeteryQid>/<ROOM>      a séance invite (?b=<bank hash>)
//   /s/party/<cemeteryQid>/<ROOM>       a graveyard party invite
//
// Unsigned on purpose: changing an ID only points at another real page (the
// same one /cemetery/<qid> would show), and every page checks Wikidata lists
// the person at that cemetery before naming them.

import { ROOM_ALPHABET, ROOM_LENGTH, partyPath } from "@/lib/games/bingo";
import { cemeteryQuery, type HauntInput } from "@/lib/haunt/haunt";
import { BANK_HASH_RE, seancePath } from "@/lib/spirit/seance";
import { SITE } from "@/lib/site";

export const SHARE_KINDS = ["stop", "tour", "seance", "party"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** Exactly as Wikidata writes them: upper-case Q, no leading zero. */
export const SHARE_QID_RE = /^Q[1-9]\d{0,11}$/;
/** Six letters from the party alphabet (no I, L or O), upper case. */
export const SHARE_ROOM_RE = new RegExp(`^[${ROOM_ALPHABET}]{${ROOM_LENGTH}}$`);

export type ShareRef =
  | { kind: "stop"; cemetery: string; person: string }
  | { kind: "tour"; cemetery: string }
  | { kind: "seance"; cemetery: string; room: string; bank: string | null }
  | { kind: "party"; cemetery: string; room: string };

export function isShareQid(v: unknown): v is string {
  return typeof v === "string" && SHARE_QID_RE.test(v);
}

export function isShareRoom(v: unknown): v is string {
  return typeof v === "string" && SHARE_ROOM_RE.test(v);
}

/** A bank hash from ?b=, or null when missing or malformed (it only feeds a mismatch check). */
export function shareBank(v: unknown): string | null {
  return typeof v === "string" && BANK_HASH_RE.test(v) ? v : null;
}

/**
 * The segments of a share link, checked strictly (no case folding, no
 * trimming): anything else is a 404. Returns null for a malformed link.
 */
export function parseShare(kind: ShareKind, segments: { cemetery?: string; person?: string; room?: string; bank?: string | null }): ShareRef | null {
  const { cemetery, person, room } = segments;
  if (!isShareQid(cemetery)) return null;
  switch (kind) {
    case "stop":
      return isShareQid(person) ? { kind, cemetery, person } : null;
    case "tour":
      return { kind, cemetery };
    case "seance":
      return isShareRoom(room) ? { kind, cemetery, room, bank: shareBank(segments.bank) } : null;
    case "party":
      return isShareRoom(room) ? { kind, cemetery, room } : null;
  }
}

/** The path of a share link without its query: the page's own segments. */
export function sharePagePath(ref: ShareRef): string {
  switch (ref.kind) {
    case "stop":
      return `/s/stop/${ref.cemetery}/${ref.person}`;
    case "tour":
      return `/s/tour/${ref.cemetery}`;
    case "seance":
      return `/s/seance/${ref.cemetery}/${ref.room}`;
    case "party":
      return `/s/party/${ref.cemetery}/${ref.room}`;
  }
}

/** The path of a share link (always the canonical spelling). A séance keeps the host's bank hash. */
export function sharePath(ref: ShareRef): string {
  const page = sharePagePath(ref);
  return ref.kind === "seance" && ref.bank ? `${page}?b=${ref.bank}` : page;
}

/** The share link on the canonical origin (lib/site.ts), for metadata. */
export function canonicalShareUrl(ref: ShareRef): string {
  return new URL(sharePath(ref), SITE.url).toString();
}

/** The share page's one call to action: the existing route, with the right params. Never gated (decision 18e). */
export function shareCtaHref(ref: ShareRef, cemetery: HauntInput | null): string {
  switch (ref.kind) {
    case "stop":
    case "tour":
      return `/cemetery/${ref.cemetery}`;
    case "seance":
      return seancePath(ref.room, ref.cemetery, ref.bank);
    case "party":
      // The room code makes the card; the cemetery (when we could name it) becomes the friend's haunt.
      return cemetery ? `${partyPath(ref.room)}&${cemeteryQuery(cemetery)}` : partyPath(ref.room);
  }
}

/** Where the story-size (1080×1920) image of a share lives. */
export function storyImagePath(ref: ShareRef): string {
  return `${sharePagePath(ref)}/story-image`;
}

/**
 * "Report this page": a new GitHub issue with the address filled in. The
 * takedown path for families (L5.5): a reported ID goes in lib/share/blocked.ts.
 */
export function reportIssueUrl(pageUrl: string): string {
  const q = new URLSearchParams({
    title: "Report a share page",
    body: [
      `Page: ${pageUrl}`,
      "",
      "What's wrong with it? For example: it's about someone in my family and I'd like it taken down, or a fact on it is wrong.",
      "",
    ].join("\n"),
  });
  return `${SITE.repo}/issues/new?${q.toString()}`;
}
