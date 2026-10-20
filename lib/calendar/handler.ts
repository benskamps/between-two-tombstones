// GET /api/calendar/[qid]: validate, load the burials, answer with the feed.
// Kept out of the route file so it can be unit tested with a fake source.

import { buildCalendar, cemeterySlug } from "./feed";
import { parseFeedParams, parseQidSegment } from "./params";
import { CalendarNotAvailableError, type BurialsSource } from "./source";

export type CalendarDeps = {
  source: BurialsSource;
  now?: () => Date;
  siteUrl?: string;
};

type ErrorSource = "Calendar" | "Wikidata" | "Wikipedia" | "OpenStreetMap";

function errorJson(status: number, message: string, source: ErrorSource = "Calendar"): Response {
  return Response.json(
    { error: { source, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** A loader error that already says who failed (Lane 2's `{ source, message, status }`), passed through as is. */
function upstreamError(e: unknown): { status: number; source: ErrorSource; message: string } | null {
  if (!e || typeof e !== "object") return null;
  const r = e as { status?: unknown; source?: unknown; message?: unknown };
  const sources: ErrorSource[] = ["Wikidata", "Wikipedia", "OpenStreetMap"];
  if (typeof r.source !== "string" || !sources.includes(r.source as ErrorSource)) return null;
  if (typeof r.message !== "string" || !r.message) return null;
  const status = typeof r.status === "number" && r.status >= 500 && r.status <= 599 ? r.status : 502;
  return { status, source: r.source as ErrorSource, message: r.message };
}

export async function handleCalendarRequest(request: Request, rawQid: string, deps: CalendarDeps): Promise<Response> {
  const qid = parseQidSegment(rawQid);
  if (!qid) return errorJson(400, "That isn't a cemetery ID. Use a Wikidata ID like Q2008469.");

  const params = parseFeedParams(new URL(request.url).searchParams);
  if (!params.ok) return errorJson(400, params.message);

  let snapshot;
  try {
    snapshot = await deps.source(qid);
  } catch (e) {
    if (e instanceof CalendarNotAvailableError) return errorJson(404, e.message);
    const up = upstreamError(e);
    if (up) return errorJson(up.status, up.message, up.source);
    return errorJson(502, "Couldn't load the burials for this cemetery. Try again in a few minutes.");
  }

  const body = buildCalendar(snapshot, {
    kinds: params.value.kinds,
    limit: params.value.limit,
    now: deps.now?.() ?? new Date(),
    siteUrl: deps.siteUrl,
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${cemeterySlug(snapshot.cemetery)}.ics"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
