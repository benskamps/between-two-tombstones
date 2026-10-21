// Share funnel events for Vercel Analytics (L5.4). Only the kind of link and
// how it left the phone: never a name, an ID, a room code or a place.

import { track } from "@vercel/analytics";
import type { ShareKind } from "./links";

export type ShareEvent = "share_created" | "share_viewed" | "tour_started_from_share";
/** How a link left the phone: the share sheet, the clipboard, shown to copy by hand, or as files (Stamp Kit). */
export type ShareVia = "share-sheet" | "copy" | "manual" | "files" | "download";

export function shareEvent(name: ShareEvent, kind: ShareKind | "stamp", via?: ShareVia): void {
  try {
    track(name, via ? { kind, via } : { kind });
  } catch {
    // Analytics never gets in the way of sharing.
  }
}
