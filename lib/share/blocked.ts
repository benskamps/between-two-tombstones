// Takedowns (PLAN.md L5.5). A share page names only what Wikidata lists, but a
// family may still not want one passed around. After a report ("Report this
// page" opens a GitHub issue with the address), add the person's or the
// cemetery's QID here and merge: every share page and image that names it
// then answers 404. The tour itself (/cemetery/<qid>) follows Wikidata.

export const BLOCKED_QIDS: ReadonlySet<string> = new Set<string>([
  // "Q123", // #issue-number, why
]);

export function isBlocked(...qids: (string | null | undefined)[]): boolean {
  return qids.some((q) => q != null && BLOCKED_QIDS.has(q));
}
