// A cemetery's name from our own data, never from the link (K2). A link's
// ?name= is whatever its sender typed; the name we show and store comes from
// the burials route (Wikidata's label, or the saved copy for the samples).
//
// One request per cemetery per page view, shared by everything that asks
// (HauntGate, the calendar picker), with a timeout and no retries.

import { MAX_NAME, MAX_PLACE, cleanText, isQid, type HauntInput } from "./haunt";

export type VerifiedCemetery = { qid: string; name: string; place?: string };

/** "Q216344" is an address, not a name. */
const ID_RE = /^Q\d+$/i;
export const VERIFY_TIMEOUT_MS = 15_000;
/** At most this many cemeteries remembered per page view. */
const MAX_REMEMBERED = 20;

/** The burials route's `cemetery`, reduced to a name we can show; null if there isn't one. */
export function readVerified(qid: string, json: unknown): VerifiedCemetery | null {
  const c = (json as { cemetery?: { qid?: unknown; name?: unknown; locatedIn?: unknown } } | null)?.cemetery;
  if (!c || (typeof c.qid === "string" && c.qid !== qid)) return null;
  const name = cleanText(c.name, MAX_NAME);
  if (!name || ID_RE.test(name)) return null;
  const place = cleanText(c.locatedIn, MAX_PLACE);
  return { qid, name, ...(place && !ID_RE.test(place) ? { place } : {}) };
}

/** GET /api/cemeteries/<qid>/burials and keep only the cemetery's name and place. Null on any failure. */
export async function fetchVerified(
  qid: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<VerifiedCemetery | null> {
  if (!isQid(qid)) return null;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? VERIFY_TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(`/api/cemeteries/${qid}/burials`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return readVerified(qid, await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

// ---------- One answer per cemetery per page view ----------

type Entry = { state: "pending" } | { state: "done"; value: VerifiedCemetery | null };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeVerified(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** undefined: not asked or still waiting; null: couldn't be verified; else the verified name. */
export function getVerified(qid: string | null): VerifiedCemetery | null | undefined {
  if (!qid) return undefined;
  const e = entries.get(qid);
  return e?.state === "done" ? e.value : undefined;
}

/** Starts the lookup once per cemetery; later calls share it. */
export function requestVerified(qid: string, fetchImpl?: typeof fetch): void {
  if (!isQid(qid) || entries.has(qid)) return;
  if (entries.size >= MAX_REMEMBERED) entries.delete(entries.keys().next().value!);
  entries.set(qid, { state: "pending" });
  void fetchVerified(qid, { fetchImpl }).then((value) => {
    entries.set(qid, { state: "done", value });
    emit();
  });
}

/** Test hook. */
export function resetVerified(): void {
  entries.clear();
}

/** A verified name as haunt input. */
export function asHauntInput(v: VerifiedCemetery): HauntInput {
  return { qid: v.qid, name: v.name, place: v.place };
}
