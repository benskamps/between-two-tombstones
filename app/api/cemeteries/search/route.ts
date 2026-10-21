import type { NextRequest } from "next/server";
import { asDataSourceError, errorResponse } from "@/lib/data/errors";
import { loadSearch } from "@/lib/data/load";
import type { SearchResponse } from "@/lib/data/types";
import { badRequest, parseQuery } from "@/lib/data/validate";

/** GET /api/cemeteries/search?q → SearchResponse: Wikidata cemeteries matching the name, with place and state. */
export async function GET(req: NextRequest) {
  const parsed = parseQuery(req.nextUrl.searchParams.get("q"));
  if (!parsed.ok) return badRequest(parsed.message);
  try {
    const results = await loadSearch(parsed.q);
    const body: SearchResponse = { query: parsed.q, results };
    // No matches may be an upstream hiccup (lib/data/cached.ts), so the CDN doesn't keep them.
    const cache = results.length > 0 ? "public, max-age=300, s-maxage=3600" : "public, max-age=60";
    return Response.json(body, { headers: { "Cache-Control": cache } });
  } catch (e) {
    return errorResponse(asDataSourceError(e, "Wikidata"));
  }
}
