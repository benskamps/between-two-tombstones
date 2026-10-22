// Polite HTTP client for Wikimedia (and Overpass). Wikimedia rate-limits shared
// IPs hard (PLAN.md, Hour 0), so every request:
// - carries the User-Agent from lib/site.ts (decision 13),
// - waits for a free slot at its host (a polling lock, so a cached function never
//   awaits a promise created by another request): one request at a time per
//   host, except query.wikidata.org, which takes WDQS_CONCURRENCY at once,
// - times out after 15 s,
// - retries 429/5xx and network failures at most 3 times, honoring Retry-After,
//   and gives up instead of waiting longer than 20 s for any single retry
//   (2 s in all for page requests: REQUEST_PATH),
// - stops at an overall deadline so a page never hangs on a dead source.
//
// DISABLE_WIKIDATA=1 (and DISABLE_WIKIPEDIA / DISABLE_OPENSTREETMAP) make every
// call to that source fail as if it were unreachable, to test outage handling.

import { USER_AGENT } from "@/lib/site";
import { DataSourceError, type DataSource } from "./errors";

export type PoliteOptions = {
  source: DataSource;
  init?: RequestInit;
  /** Per attempt, including reading the body. */
  timeoutMs?: number;
  maxRetries?: number;
  /** Longest single wait before a retry; a longer Retry-After means give up now. */
  maxWaitMs?: number;
  /** All waits before retries (Retry-After, backoff, another call's 429) added up; past it, give up now. */
  maxTotalWaitMs?: number;
  /** Whole call, including waiting for a turn at the host. */
  deadlineMs?: number;
  /** Minimum gap between two requests to the same host. */
  spacingMs?: number;
};

export const DEFAULTS = {
  timeoutMs: 15_000,
  maxRetries: 3,
  maxWaitMs: 20_000,
  deadlineMs: 40_000,
  spacingMs: 100,
  lockPollMs: 25,
} as const;

/**
 * Parallel queries allowed to the Wikidata Query Service from one instance.
 * WDQS allows 5 at once per client IP; everything else stays serial.
 *
 * Why 3: one slow burials query (up to 27 s) used to hold the only slot, so a
 * 20 ms search waited behind it (red team P1-2). /near warms up to 2 tours in
 * after(), which is two slow burials queries at once; a third slot keeps search,
 * near and facts moving past them. The Gravitator's own client
 * (lib/gravitator/wikimedia.ts) sends one WDQS query at a time, so an instance
 * stays at 4 or fewer, under the limit of 5. WDQS also limits query time per
 * minute and answers 429 with Retry-After past it; that window is shared by
 * every request to the host (blockedUntil below).
 */
export const WDQS_CONCURRENCY = 3;
const CONCURRENCY: Record<string, number> = { "query.wikidata.org": WDQS_CONCURRENCY };

/** How many requests may be in flight to `host` at once. */
export function hostConcurrency(host: string): number {
  return CONCURRENCY[host] ?? 1;
}

/**
 * Every request a page makes (lib/data). Gate 2 gives a stranger 20 s to see
 * five stories, so a page never sits out a rate limit: at most about 2 s of
 * retry waits in all, then the call fails fast and the page shows what it has
 * (a "stories missing" warning, or the saved copy for the samples).
 */
export const REQUEST_PATH = { maxWaitMs: 2_000, maxTotalWaitMs: 2_000 } as const satisfies Partial<PoliteOptions>;

type Transport = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

const realTransport: Transport = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

let transport: Transport = realTransport;

/** Unit tests swap in recorded fixtures and a fake clock. */
export function setTransportForTests(t: Partial<Transport> | null) {
  transport = t ? { ...realTransport, ...t } : realTransport;
  hosts.clear();
}

/** `active`: requests holding a slot. `blockedUntil`: a 429's Retry-After, shared by every request to the host. */
type HostState = { active: number; lastAt: number; blockedUntil: number };
const hosts = new Map<string, HostState>();

function hostState(host: string): HostState {
  let s = hosts.get(host);
  if (!s) {
    s = { active: 0, lastAt: 0, blockedUntil: 0 };
    hosts.set(host, s);
  }
  return s;
}

export function isSourceDisabled(source: DataSource): boolean {
  const key = `DISABLE_${source.toUpperCase()}`;
  return process.env[key] === "1";
}

/** Retry-After in seconds, from either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs;
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, (at - now) / 1000);
  return null;
}

/** One line per upstream request: host, status, time. No URLs (they carry user queries), no secrets. */
function log(host: string, outcome: string, ms: number, attempt: number) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  console.info(`[upstream] ${host} ${outcome} ${Math.round(ms)}ms${attempt > 0 ? ` retry ${attempt}` : ""}`);
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const code = (err.cause as { code?: string } | undefined)?.code;
    return code ? `${err.message} (${code})` : err.message;
  }
  return String(err);
}

/**
 * GET/POST a URL and parse JSON, politely. Throws DataSourceError naming the source.
 */
export async function politeJson<T>(url: string, opts: PoliteOptions): Promise<T> {
  const { source } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxRetries = opts.maxRetries ?? DEFAULTS.maxRetries;
  const maxWaitMs = opts.maxWaitMs ?? DEFAULTS.maxWaitMs;
  const spacingMs = opts.spacingMs ?? DEFAULTS.spacingMs;
  const maxTotalWaitMs = opts.maxTotalWaitMs ?? Infinity;
  const host = new URL(url).host;
  /** Retry waits so far (not the turn at the host, not the spacing). */
  let waited = 0;

  if (isSourceDisabled(source)) {
    throw new DataSourceError(source, "unreachable", `${source} is switched off on this server (DISABLE_${source.toUpperCase()}=1).`);
  }

  const start = transport.now();
  const deadline = start + (opts.deadlineMs ?? DEFAULTS.deadlineMs);
  const state = hostState(host);
  const slots = hostConcurrency(host);

  /** A Retry-After another call received that's longer than this call may wait: fail now. */
  const tooLongBlocked = (now: number): DataSourceError | null => {
    const blockedFor = state.blockedUntil - now;
    if (blockedFor <= 0) return null;
    if (blockedFor > maxWaitMs || waited + blockedFor > maxTotalWaitMs || now + blockedFor >= deadline) {
      return new DataSourceError(source, "rate-limited", `${host} asked us to wait ${Math.ceil(blockedFor / 1000)} s.`, {
        status: 429,
        retryAfterSeconds: Math.ceil(blockedFor / 1000),
      });
    }
    return null;
  };

  // Wait for a free slot at this host. Bounded by the deadline, and given up at
  // once if the host has asked us to wait longer than this call can.
  const maxPolls = Math.ceil((deadline - start) / DEFAULTS.lockPollMs) + 1;
  for (let polls = 0; state.active >= slots; polls++) {
    const blocked = tooLongBlocked(transport.now());
    if (blocked) throw blocked;
    if (polls >= maxPolls || transport.now() >= deadline) {
      throw new DataSourceError(source, "timeout", `Waited too long for a turn at ${host}.`);
    }
    await transport.sleep(DEFAULTS.lockPollMs);
  }
  state.active++;

  try {
    for (let attempt = 0; ; attempt++) {
      // Respect a Retry-After another call already received, and the spacing.
      const now = transport.now();
      const blockedFor = state.blockedUntil - now;
      if (blockedFor > 0) {
        const blocked = tooLongBlocked(now);
        if (blocked) throw blocked;
        waited += blockedFor;
        await transport.sleep(blockedFor);
      }
      const gap = state.lastAt + spacingMs - transport.now();
      if (gap > 0) await transport.sleep(gap);

      const remaining = deadline - transport.now();
      if (remaining <= 0) throw new DataSourceError(source, "timeout", `Gave up on ${host} after the overall deadline.`);
      state.lastAt = transport.now();

      let res: Response;
      let body: T;
      const sentAt = transport.now();
      try {
        res = await transport.fetch(url, {
          ...opts.init,
          headers: {
            "User-Agent": USER_AGENT,
            "Api-User-Agent": USER_AGENT,
            Accept: "application/json",
            ...(opts.init?.headers as Record<string, string> | undefined),
          },
          signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
        });
        if (res.ok) {
          try {
            body = (await res.json()) as T;
          } catch (err) {
            if (isTimeout(err)) throw err;
            throw new DataSourceError(source, "bad-response", `${host} sent a response that isn't JSON.`, { status: res.status, cause: err });
          }
          log(host, String(res.status), transport.now() - sentAt, attempt);
          return body;
        }
        log(host, String(res.status), transport.now() - sentAt, attempt);
      } catch (err) {
        if (err instanceof DataSourceError) throw err;
        const kind = isTimeout(err) ? "timeout" : "unreachable";
        log(host, kind, transport.now() - sentAt, attempt);
        const backoff = Math.min(1000 * 2 ** attempt, maxWaitMs);
        if (attempt >= maxRetries || waited + backoff > maxTotalWaitMs || transport.now() + backoff >= deadline) {
          throw new DataSourceError(source, kind, `${host}: ${describe(err)}`, { cause: err });
        }
        waited += backoff;
        await transport.sleep(backoff);
        continue;
      }

      // Not OK: retry only what's worth retrying.
      const retryable = res.status === 429 || res.status >= 500;
      const ra = parseRetryAfter(res.headers.get("retry-after"), transport.now());
      if (res.status === 429 && ra !== null) state.blockedUntil = transport.now() + ra * 1000;
      if (!retryable) {
        throw new DataSourceError(source, "bad-response", `${host} answered ${res.status} ${res.statusText}.`, { status: res.status });
      }
      const kind = res.status === 429 ? "rate-limited" : res.status === 503 || res.status === 504 ? "unreachable" : "bad-response";
      const waitMs = ra !== null ? ra * 1000 : Math.min(1000 * 2 ** attempt, maxWaitMs);
      if (attempt >= maxRetries || waitMs > maxWaitMs || waited + waitMs > maxTotalWaitMs || transport.now() + waitMs >= deadline) {
        throw new DataSourceError(source, kind, `${host} answered ${res.status}${ra !== null ? ` and asked us to wait ${Math.ceil(ra)} s` : ""}.`, {
          status: res.status,
          retryAfterSeconds: ra ?? undefined,
        });
      }
      // Drain the body so the connection can be reused.
      await res.body?.cancel().catch(() => {});
      waited += waitMs;
      await transport.sleep(waitMs);
    }
  } finally {
    state.active--;
  }
}
