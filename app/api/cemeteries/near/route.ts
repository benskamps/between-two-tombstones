import type { NextRequest } from "next/server";
import { asDataSourceError, errorResponse } from "@/lib/data/errors";
import { loadNear } from "@/lib/data/load";
import { badRequest, parseLatLon } from "@/lib/data/validate";

/** GET /api/cemeteries/near?lat&lon → NearResponse: Wikidata cemeteries within 10 km, OSM merged when it answers. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const at = parseLatLon(sp.get("lat"), sp.get("lon"));
  if (!at.ok) return badRequest(at.message);
  try {
    const data = await loadNear(at.lat, at.lon);
    const allOk = data.sources.every((s) => s.ok);
    return Response.json(data, {
      headers: { "Cache-Control": allOk ? "public, max-age=300, s-maxage=3600" : "public, max-age=60" },
    });
  } catch (e) {
    return errorResponse(asDataSourceError(e, "Wikidata"));
  }
}
