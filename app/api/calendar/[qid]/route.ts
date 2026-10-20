// Haunted Calendar feed: GET /api/calendar/Q2008469 (or .../Q2008469.ics)
// → text/calendar with yearly death-days (and, with kinds=death,birth,
// birthdays). See lib/calendar/feed.ts for who gets in and why.
//
// No `runtime` export: with Cache Components on, Next 16 rejects it.

import { handleCalendarRequest } from "@/lib/calendar/handler";
import { burialsSource } from "@/lib/calendar/source";

export async function GET(request: Request, ctx: RouteContext<"/api/calendar/[qid]">): Promise<Response> {
  const { qid } = await ctx.params;
  return handleCalendarRequest(request, qid, { source: burialsSource });
}
