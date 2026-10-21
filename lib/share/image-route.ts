// The image routes' shared body (opengraph-image and story-image under app/s/**),
// kept apart from lib/share/page.tsx so the pages don't carry the image code
// and fonts.

import { connection } from "next/server";
import type { CardFormat } from "./card";
import { shareImage } from "./image";
import { parseShare, type ShareKind } from "./links";
import { loadShare } from "./load";

type Segments = { cemetery?: string; person?: string; room?: string };

export async function shareImageFor(kind: ShareKind, params: Promise<Segments>, format: CardFormat): Promise<Response> {
  const ref = parseShare(kind, await params);
  await connection();
  return shareImage(kind, ref ? await loadShare(ref) : null, format);
}

/** og:image:alt for each kind (the image route's `alt`; the words on the card are in the page's description too). */
export const SHARE_IMAGE_ALT: Record<ShareKind, string> = {
  stop: "A headstone card: the person's name, dates and age, and the cemetery",
  tour: "A cemetery tour card: the cemetery, how many people are listed and the first three stops",
  seance: "A séance invite: the room code and the cemetery",
  party: "A graveyard party invite: the room code and the cemetery",
};
