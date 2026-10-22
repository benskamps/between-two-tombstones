// Polite Wikimedia client for the Gravitator deck (server only). Ported from
// scripts/wd.mjs: our User-Agent (PLAN.md decision 13), requests serial per
// host with 1 s spacing, timeouts, and capped retries on 429/5xx that honor
// Retry-After. Everything runs under one deadline so a deck never outlives the
// route's maxDuration: a request whose turn comes too late fails without being
// sent, and each host's queue holds at most MAX_QUEUED_PER_HOST requests.

import { USER_AGENT } from "@/lib/site";
import type { DeckFetcher } from "./deck";
import type { ExtractsJson, SparqlJson } from "./parse";

const SPACING_MS = 1000;
/** A request needs at least this long before the deadline to be worth sending. */
const MIN_REMAINING_MS = 1500;
/**
 * Requests waiting for or holding a turn at one host. With 1 s spacing and
 * queries that take seconds, the 11th in line couldn't start before a deck's
 * deadline anyway, so it fails at once instead of joining.
 */
export const MAX_QUEUED_PER_HOST = 10;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const queues = new Map<string, Promise<unknown>>();
const lastStart = new Map<string, number>();
const queued = new Map<string, number>();

/** The request never went out: its host's queue was full, or its turn came too close to the deadline. */
export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueError";
  }
}

/**
 * Runs `fn` after every earlier request to the same host, at least 1 s after the
 * last one started, with the time left before `deadline` at that moment. Throws
 * QueueError without running `fn` when the queue is full or the turn comes too late.
 */
function serial<T>(host: string, deadline: number, fn: (remainingMs: number) => Promise<T>): Promise<T> {
  const depth = queued.get(host) ?? 0;
  if (depth >= MAX_QUEUED_PER_HOST) {
    return Promise.reject(new QueueError(`${MAX_QUEUED_PER_HOST} requests are already waiting for ${host}`));
  }
  queued.set(host, depth + 1);
  const prev = queues.get(host) ?? Promise.resolve();
  const run = prev
    .then(async () => {
      const wait = (lastStart.get(host) ?? 0) + SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      // Checked when the turn comes, not when the request joined the queue.
      const remaining = deadline - Date.now();
      if (remaining < MIN_REMAINING_MS) throw new QueueError(`out of time while waiting for ${host}`);
      lastStart.set(host, Date.now());
      return fn(remaining);
    })
    .finally(() => queued.set(host, (queued.get(host) ?? 1) - 1));
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
    if (opts.deadline - Date.now() < MIN_REMAINING_MS) throw new QueueError(`out of time before asking ${host}`);
    let res: Response;
    try {
      res = await serial(host, opts.deadline, (remaining) =>
        fetch(url, {
          ...init,
          headers: { "User-Agent": USER_AGENT, ...(init.headers as Record<string, string> | undefined) },
          signal: AbortSignal.timeout(Math.min(opts.timeoutMs, remaining)),
        }),
      );
    } catch (err) {
      // Never sent: retrying would only queue again behind the same requests.
      if (err instanceof QueueError) throw err;
      if (attempt >= opts.retries) throw err;
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < opts.retries) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt;
      if (wait <= opts.maxRetryWaitMs && Date.now() + wait + MIN_REMAINING_MS < opts.deadline) {
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
