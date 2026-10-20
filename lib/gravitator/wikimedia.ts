// Polite Wikimedia client for the Gravitator deck (server only). Ported from
// scripts/wd.mjs: our User-Agent (PLAN.md decision 13), requests serial per
// host with 1 s spacing, timeouts, and capped retries on 429/5xx that honor
// Retry-After. Everything runs under one deadline so a deck never outlives the
// route's maxDuration.

import { USER_AGENT } from "@/lib/site";
import type { DeckFetcher } from "./deck";
import type { ExtractsJson, SparqlJson } from "./parse";

const SPACING_MS = 1000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const queues = new Map<string, Promise<unknown>>();
const lastStart = new Map<string, number>();

/** Runs `fn` after every earlier request to the same host, at least 1 s after the last one started. */
function serial<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(host) ?? Promise.resolve();
  const run = prev.then(async () => {
    const wait = (lastStart.get(host) ?? 0) + SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart.set(host, Date.now());
    return fn();
  });
  queues.set(
    host,
    run.catch(() => undefined),
  );
  return run;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly host: string,
  ) {
    super(`${status} from ${host}`);
    this.name = "HttpError";
  }
}

export type PoliteOptions = {
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Retries after the first attempt (429, 5xx, network errors). */
  retries: number;
  /** Longest Retry-After we'll wait; a longer one fails fast. */
  maxRetryWaitMs: number;
  /** Absolute time (ms) by which everything must be done. */
  deadline: number;
};

export async function politeFetch(url: string, init: RequestInit, opts: PoliteOptions): Promise<Response> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const remaining = opts.deadline - Date.now();
    if (remaining < 1500) throw new Error(`out of time before asking ${host}`);
    let res: Response;
    try {
      res = await serial(host, () =>
        fetch(url, {
          ...init,
          headers: { "User-Agent": USER_AGENT, ...(init.headers as Record<string, string> | undefined) },
          signal: AbortSignal.timeout(Math.min(opts.timeoutMs, remaining)),
        }),
      );
    } catch (err) {
      if (attempt >= opts.retries) throw err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < opts.retries) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt;
      if (wait <= opts.maxRetryWaitMs && Date.now() + wait + 1500 < opts.deadline) {
        await res.body?.cancel();
        await sleep(wait);
        continue;
      }
    }
    await res.body?.cancel();
    throw new HttpError(res.status, host);
  }
}

const SPARQL_URL = "https://query.wikidata.org/sparql";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

/** The real fetcher. `budgetMs` covers the whole deck. */
export function liveFetcher(budgetMs = 50_000): DeckFetcher {
  const deadline = Date.now() + budgetMs;
  return {
    async sparql(query, method) {
      const opts = { timeoutMs: 25_000, retries: 2, maxRetryWaitMs: 10_000, deadline };
      const headers = { Accept: "application/sparql-results+json" };
      const res =
        method === "GET"
          ? await politeFetch(`${SPARQL_URL}?query=${encodeURIComponent(query)}`, { headers }, opts)
          : await politeFetch(
              SPARQL_URL,
              {
                method: "POST",
                headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
                body: `query=${encodeURIComponent(query)}`,
              },
              opts,
            );
      return (await res.json()) as SparqlJson;
    },
    async extracts(titles) {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exlimit: "20",
        redirects: "1",
        titles: titles.join("|"),
      });
      const res = await politeFetch(
        `${WIKIPEDIA_API}?${params}`,
        {},
        { timeoutMs: 10_000, retries: 1, maxRetryWaitMs: 5_000, deadline },
      );
      return (await res.json()) as ExtractsJson;
    },
  };
}
