// Metadata for a share page: what iMessage, Slack and the rest show in the
// unfurl. The image itself comes from the route's opengraph-image file; every
// URL is absolute on the canonical origin (lib/site.ts, also metadataBase).

import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { canonicalShareUrl, type ShareKind, type ShareRef } from "./links";
import type { ShareLoad } from "./load";
import { shareDescription, shareTitle } from "./model";

const FALLBACK: Record<ShareKind, { title: string; description: string }> = {
  stop: { title: "A stop on a cemetery tour", description: "One grave worth visiting, with the story of the person buried there." },
  tour: { title: "A cemetery tour", description: "The graves worth visiting at a cemetery, with how those people lived." },
  seance: { title: "Séance", description: "Every phone that joins speaks the same names at the same second." },
  party: { title: "Graveyard party", description: "Everyone who joins plays Tombstone Bingo on the same card." },
};

export function shareMetadata(ref: ShareRef, load: ShareLoad): Metadata {
  const card = load.status === "not-found" ? null : load.card;
  const title = card ? shareTitle(card) : FALLBACK[ref.kind].title;
  const description = card ? shareDescription(card) : FALLBACK[ref.kind].description;
  const url = canonicalShareUrl(ref);
  return {
    title,
    description,
    alternates: { canonical: url },
    // Copies of what /cemetery and the tools show, and room codes that expire in practice: kept out of search.
    robots: { index: false, follow: true },
    openGraph: { type: "website", siteName: SITE.name, locale: "en_US", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}
