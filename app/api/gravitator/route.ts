// GET /api/gravitator?lat&lon&radius: the Gravitator swipe deck, public
// cemeteries near a point. See lib/gravitator/deck.ts for the data flow and
// lib/gravitator/cached.ts for caching.
//
// No `runtime` export: with Cache Components on, Next 16 rejects it.

import { getDeck, roundPoint } from "@/lib/gravitator/cached";
import { handleDeckRequest } from "@/lib/gravitator/request";

/** Seconds. The deck's own budget is 50 s (lib/gravitator/wikimedia.ts). */
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  return handleDeckRequest(request.url, getDeck, roundPoint, { DISABLE_WIKIDATA: process.env.DISABLE_WIKIDATA });
}
