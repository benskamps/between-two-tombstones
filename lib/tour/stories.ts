// The tour page shows the first stories as soon as Wikipedia sends them,
// instead of waiting for all 80 (review pass 4, item 1). The server sends the
// people with the stories it has, the people still waiting for one, and a
// promise for the rest. Pure helpers, shared by lib/data/load.ts (server) and
// components/tour/TourView.tsx (browser).

import type { TourWarning } from "@/lib/data/types";
import type { Person, WikipediaSummary } from "@/lib/types";

/** The stories that land after the first ones, by person QID, with what went wrong on the way. */
export type MoreStories = {
  stories: Record<string, WikipediaSummary>;
  warnings: TourWarning[];
};

/** The browser stops waiting for the rest after this long (the server gives up first, at MORE_STORIES_BUDGET_MS). */
export const MORE_STORIES_WAIT_MS = 40_000;

/** Said when the rest never arrived (the connection dropped, or the browser's own wait ran out). */
export const MORE_STORIES_LOST: TourWarning = {
  source: "Wikipedia",
  code: "stories-missing",
  message: "Some stories didn't arrive from Wikipedia. Names and dates are all here; reload in a minute for the rest.",
};

/** Give the people still waiting the stories that came in. Everyone else is left as they are. */
export function addStories<T extends { people: Person[] }>(data: T, more: Pick<MoreStories, "stories">): T {
  let changed = false;
  const people = data.people.map((p) => {
    const story = more.stories[p.qid];
    if (p.wikipedia || !story) return p;
    changed = true;
    return { ...p, wikipedia: story };
  });
  return changed ? { ...data, people } : data;
}

/** True when some stories didn't load this time, so a missing one may exist on Wikipedia. */
export function storiesIncomplete(warnings: readonly TourWarning[]): boolean {
  return warnings.some((w) => w.code === "stories-missing");
}
