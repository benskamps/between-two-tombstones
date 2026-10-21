// Loads the burials for the spirit box. Tries the live route first
// (GET /api/cemeteries/[qid]/burials, a CemeterySnapshot) and falls back to the
// saved copy bundled with the app for the sample cemeteries.

import { personName } from "../tour/text";
import type { SpiritPerson } from "./wordbank";

export type SampleCemetery = {
  qid: string;
  name: string;
  place: string;
  /** When the saved copy was pulled from Wikidata. */
  fetchedAt: string;
  people: SpiritPerson[];
};

export type LoadedCemetery = {
  qid: string;
  name: string;
  people: SpiritPerson[];
  /** "live" = from the burials route just now; "saved" = the copy bundled with the app. */
  source: "live" | "saved";
  fetchedAt: string | null;
};

export type LoadResult =
  | { ok: true; cemetery: LoadedCemetery; note: string | null }
  | { ok: false; message: string };

export const QID_RE = /^Q[1-9]\d*$/;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Pull only the fields the spirit box needs, checking each one. The spirit box
 * never speaks an ID: a bare-QID name (no English label on Wikidata) takes the
 * English Wikipedia title, as the tour does, or the person is left out.
 */
export function toSpiritPerson(raw: unknown): SpiritPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const qid = str(r.qid);
  const wikipedia = r.wikipedia && typeof r.wikipedia === "object" ? (r.wikipedia as Record<string, unknown>) : null;
  const name = personName(str(r.name), str(wikipedia?.title));
  if (!qid || !name) return null;
  return {
    qid,
    name,
    death: str(r.death),
    deathPrecision: typeof r.deathPrecision === "number" ? r.deathPrecision : null,
    occupations: Array.isArray(r.occupations) ? r.occupations.filter((o): o is string => typeof o === "string") : [],
  };
}

/** A CemeterySnapshot from the route, reduced to what we use; null if it isn't one. */
export function parseBurials(json: unknown): { name: string; fetchedAt: string | null; people: SpiritPerson[] } | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const cemetery = j.cemetery as Record<string, unknown> | undefined;
  const name = cemetery && str(cemetery.name);
  if (!name || !Array.isArray(j.people)) return null;
  const people = j.people.map(toSpiritPerson).filter((p): p is SpiritPerson => p !== null);
  return { name, fetchedAt: str(j.fetchedAt), people };
}

/** The route's `{ error: { source, message } }`, as one sentence. */
export function routeError(json: unknown, status: number): string {
  const e = (json as { error?: { source?: unknown; message?: unknown } } | null)?.error;
  const source = str(e?.source);
  const message = str(e?.message);
  if (source && message) return `${source}: ${message}`;
  if (message) return message;
  if (status === 404) return "the burials service isn't available yet";
  return `the server answered ${status}`;
}

export async function loadCemetery(
  qid: string,
  opts: {
    fallback?: SampleCemetery;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<LoadResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let problem: string;
  try {
    const res = await fetchImpl(`/api/cemeteries/${encodeURIComponent(qid)}/burials`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    const json: unknown = await res.json().catch(() => null);
    const parsed = res.ok ? parseBurials(json) : null;
    if (parsed) {
      return {
        ok: true,
        cemetery: { qid, name: parsed.name, people: parsed.people, source: "live", fetchedAt: parsed.fetchedAt },
        note: null,
      };
    }
    problem = res.ok ? "the burials list came back in a shape we don't understand" : routeError(json, res.status);
  } catch {
    problem = opts.signal?.aborted
      ? "cancelled"
      : `no answer within ${Math.round(timeoutMs / 1000)} seconds (you may be offline)`;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }

  if (opts.fallback) {
    const f = opts.fallback;
    return {
      ok: true,
      cemetery: { qid, name: f.name, people: f.people, source: "saved", fetchedAt: f.fetchedAt },
      note: `Couldn't load fresh names (${problem}), so this uses the copy saved with the app.`,
    };
  }
  return { ok: false, message: `Couldn't load the burials for this cemetery: ${problem}.` };
}
