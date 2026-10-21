// The share images as responses: the 1200×630 link preview (opengraph-image)
// and the 1080×1920 story image, from the same card model as the page.
//
// Caching, in three layers:
// - the data: the tour's own loaders, cached for a week ('use cache: remote');
// - the PNG: cached per card ('use cache', keyed by the card's words, so a
//   change in the data is a new entry and an outage card never replaces a
//   real one);
// - the response: a day at the CDN for a real card, a minute for the
//   stand-in drawn while Wikidata is down.

import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { CARD_SIZE, CardImage, cardVariant, type CardFormat } from "./card";
import { shareFonts } from "./fonts";
import type { ShareKind } from "./links";
import type { ShareLoad } from "./load";
import type { ShareCard } from "./model";

const FRESH = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const STAND_IN = "public, max-age=60, s-maxage=60";

async function draw(card: ShareCard | null, kind: ShareKind, format: CardFormat): Promise<ArrayBuffer> {
  const fonts = await shareFonts();
  const res = new ImageResponse(<CardImage card={card} kind={kind} format={format} />, { ...CARD_SIZE[format], fonts });
  return res.arrayBuffer();
}

/** One PNG per card, format and kind. The key is the card itself (plain JSON). */
async function cachedPng(cardJson: string, kind: ShareKind, format: CardFormat): Promise<Uint8Array> {
  "use cache";
  cacheLife("weeks");
  return new Uint8Array(await draw(JSON.parse(cardJson) as ShareCard | null, kind, format));
}

function png(body: Uint8Array, cacheControl: string, variant: string): Response {
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": cacheControl,
      // Which card was drawn: "carved", "plain" (recent or unknown death), "tour", "room" or "generic".
      "X-Share-Card": variant,
    },
  });
}

export async function shareImage(kind: ShareKind, load: ShareLoad | null, format: CardFormat): Promise<Response> {
  if (!load || load.status === "not-found") {
    return new Response("No share card here.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  const card = load.card;
  const cacheControl = load.status === "ok" ? FRESH : STAND_IN;
  try {
    return png(await cachedPng(JSON.stringify(card), kind, format), cacheControl, cardVariant(card));
  } catch (err) {
    console.error(`[share] couldn't draw the ${kind} card:`, err instanceof Error ? err.message : err);
  }
  try {
    // Never a broken image in a chat: the plain brand card instead, briefly cached.
    return png(new Uint8Array(await draw(null, kind, format)), STAND_IN, "generic");
  } catch {
    return new Response("Couldn't draw this card.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
