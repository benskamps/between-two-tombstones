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
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch (e) {
    return errorResponse(asDataSourceError(e, "Wikidata"));
  }
}
