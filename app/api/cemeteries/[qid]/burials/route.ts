import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/data/errors";
import { loadCemetery } from "@/lib/data/load";
import { badRequest, parseQid } from "@/lib/data/validate";

/**
 * GET /api/cemeteries/{qid}/burials → BurialsResponse (a CemeterySnapshot plus
 * `origin` and `warnings`): cemetery facts and up to 80 people with Wikipedia
 * intro extracts. The two sample cemeteries fall back to their saved copies.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/cemeteries/[qid]/burials">) {
  const { qid: raw } = await ctx.params;
  const parsed = parseQid(raw);
  if (!parsed.ok) return badRequest(parsed.message);

  const result = await loadCemetery(parsed.qid);
  if (result.status === "not-found") {
    return Response.json(
      { error: { source: "Wikidata", message: `Wikidata has no item ${parsed.qid}.` } },
      { status: 404, headers: { "Cache-Control": "public, max-age=300" } },
    );
  }
  if (result.status === "error") return errorResponse(result.error);
  const { data } = result;
  const fresh = data.origin === "live" && data.warnings.length === 0;
  return Response.json(data, {
    headers: { "Cache-Control": fresh ? "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" : "no-store" },
  });
}
