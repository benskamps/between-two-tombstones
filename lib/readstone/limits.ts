// In-memory limits for /api/read-stone. All of it is best effort per server
// instance (decision 12): a cold start forgets everything, and two instances
// don't share counts. The hard cap is the Anthropic workspace spend limit.

export type WindowRule = { ms: number; max: number };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Per phone (signed device cookie). */
export const DEVICE_RULES = { burst: { ms: 10 * MINUTE, max: 5 }, daily: { ms: DAY, max: 20 } } as const;
/** Per network (client IP). Looser, because many phones can share one carrier IP. */
export const IP_RULES = { burst: { ms: 10 * MINUTE, max: 15 }, daily: { ms: DAY, max: 60 } } as const;

export type LimitVerdict = { ok: true } | { ok: false; rule: "burst" | "daily"; retryAfterMs: number };

/** Sliding-window counter per key, holding at most `maxKeys` keys (least recently used go first). */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private rules: { burst: WindowRule; daily: WindowRule },
    private maxKeys = 5000,
  ) {}

  private recent(key: string, now: number): number[] {
    const longest = Math.max(this.rules.burst.ms, this.rules.daily.ms);
    return (this.hits.get(key) ?? []).filter((t) => t > now - longest);
  }

  check(key: string, now: number): LimitVerdict {
    const times = this.recent(key, now);
    let worst: LimitVerdict = { ok: true };
    for (const rule of ["burst", "daily"] as const) {
      const { ms, max } = this.rules[rule];
      const inWindow = times.filter((t) => t > now - ms);
      if (inWindow.length >= max) {
        // Wait until enough old hits fall out that one more fits.
        const retryAfterMs = inWindow[inWindow.length - max] + ms - now;
        if (worst.ok || retryAfterMs > worst.retryAfterMs) worst = { ok: false, rule, retryAfterMs };
      }
    }
    return worst;
  }

  record(key: string, now: number): void {
    const times = this.recent(key, now);
    times.push(now);
    this.hits.delete(key); // re-insert so the Map's order is least-recently-used first
    this.hits.set(key, times.slice(-Math.max(this.rules.burst.max, this.rules.daily.max)));
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }

  get size(): number {
    return this.hits.size;
  }

  clear(): void {
    this.hits.clear();
  }
}

/** Small LRU with a time-to-live; holds results only, never image bytes. */
export class LruCache<V> {
  private entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private maxEntries: number,
    private ttlMs: number,
  ) {}

  get(key: string, now: number): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= now) return undefined;
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Published prices for claude-sonnet-5-5 in USD per million tokens (from the
 * claude-api skill's model table, cached 2026-10-06). Server-side fallback goes
 * to Claude Sonnet 5, which has the same prices.
 */
export const SONNET_5_5_USD_PER_MTOK = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 } as const;

type TokenCounts = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export type TokenUsage = TokenCounts & {
  /** Per attempt. With server-side fallback, the declined attempt ("message") and the fallback ("fallback_message") each get one. */
  iterations?: readonly (TokenCounts & { type: string })[] | null;
};

export function estimateCostUsd(usage: TokenCounts): number {
  const p = SONNET_5_5_USD_PER_MTOK;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead) /
    1_000_000
  );
}

/**
 * What one response was billed. The top-level usage covers only the attempt
 * that produced the message; a server-side fallback also bills the attempt that
 * was declined, so the attempts are added up when they're listed.
 */
export function billedCostUsd(usage: TokenUsage): number {
  const top = estimateCostUsd(usage);
  const attempts = (usage.iterations ?? []).filter((i) => i.type === "message" || i.type === "fallback_message");
  if (attempts.length === 0) return top;
  return Math.max(top, attempts.reduce((sum, a) => sum + estimateCostUsd(a), 0));
}

/** One read's worst-case estimate, held against the cap until the read settles. */
export type BudgetHold = {
  /** The read finished: drop the hold and count what it cost. */
  settle(usd: number, now: number): void;
  /** The read cost nothing: drop the hold. */
  release(): void;
};

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Today's (UTC) estimated Claude spend on this instance, plus reads still running. */
export class DailyBudget {
  private day = "";
  private spent = 0;
  private reserved = 0;

  private roll(now: number): void {
    const today = utcDay(now);
    if (today !== this.day) {
      this.day = today;
      this.spent = 0;
    }
  }

  spentToday(now: number): number {
    this.roll(now);
    return this.spent;
  }

  /** True once today's spend (counting reads in flight) has reached the cap. */
  isOver(capUsd: number, now: number): boolean {
    this.roll(now);
    return this.spent + this.reserved >= capUsd;
  }

  /** Today's spend plus every hold still open. */
  committed(now: number): number {
    this.roll(now);
    return this.spent + this.reserved;
  }

  /**
   * Holds a read's worst-case cost, but only if today's spend, every open hold
   * and this one together stay within the cap; otherwise null. The check and the
   * hold happen in one step, so parallel reads can never commit more than the cap.
   */
  tryReserve(worstCaseUsd: number, capUsd: number, now: number): BudgetHold | null {
    this.roll(now);
    if (this.spent + this.reserved + worstCaseUsd > capUsd) return null;
    const release = this.reserve(worstCaseUsd);
    let open = true;
    return {
      settle: (usd, at) => {
        if (!open) return;
        open = false;
        release();
        this.add(usd, at);
      },
      release: () => {
        open = false;
        release();
      },
    };
  }

  reserve(estimateUsd: number): () => void {
    this.reserved += estimateUsd;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reserved = Math.max(0, this.reserved - estimateUsd);
    };
  }

  add(usd: number, now: number): void {
    this.roll(now);
    this.spent += usd;
  }

  clear(): void {
    this.day = "";
    this.spent = 0;
    this.reserved = 0;
  }

  /** Milliseconds until the cap resets at midnight UTC. */
  static msUntilReset(now: number): number {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.getTime() - now;
  }
}

/** "in about a minute", "in 4 minutes", "in 3 hours". */
export function whenAgain(ms: number): string {
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes <= 1) return "in about a minute";
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.ceil(ms / HOUR);
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}
