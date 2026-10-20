// Feed settings shared by the server (feed, route) and the browser (the
// /calendar page). No imports, so the page bundle stays small.

export type EventKind = "death" | "birth";
export const EVENT_KINDS: readonly EventKind[] = ["death", "birth"];
export const DEFAULT_KINDS: readonly EventKind[] = ["death"];
export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 80;
