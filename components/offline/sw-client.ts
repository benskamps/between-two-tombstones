// Ask the service worker to keep a page and the scripts it runs on, so the page
// opens with the network off. Every wait is capped.

const READY_TIMEOUT_MS = 5_000;
const REPLY_TIMEOUT_MS = 20_000;
const MAX_URLS = 120;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

/** Same-origin Next.js assets this page has loaded (scripts, styles, fonts). */
export function pageAssetUrls(): string[] {
  const urls = new Set<string>();
  for (const e of performance.getEntriesByType("resource")) {
    const u = new URL(e.name, location.href);
    if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
  }
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => {
    const u = new URL(s.src, location.href);
    if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
  });
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href], link[rel="preload"][href]').forEach((l) => {
    const u = new URL(l.href, location.href);
    if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) urls.add(u.pathname + u.search);
  });
  return [...urls].slice(0, MAX_URLS);
}

export type CacheResult = { ok: boolean; cached: number; failed: number; reason?: string };

/** Returns { ok: false, reason } when there's no service worker to ask. */
export async function cachePagesForOffline(pages: string[]): Promise<CacheResult> {
  if (!("serviceWorker" in navigator)) return { ok: false, cached: 0, failed: 0, reason: "no-service-worker" };
  const reg = await withTimeout(navigator.serviceWorker.ready, READY_TIMEOUT_MS);
  const worker = reg?.active;
  if (!worker) return { ok: false, cached: 0, failed: 0, reason: "no-service-worker" };
  const urls = [...new Set([...pages, ...pageAssetUrls()])].slice(0, MAX_URLS);
  const reply = await withTimeout(
    new Promise<CacheResult>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (ev) => resolve(ev.data as CacheResult);
      worker.postMessage({ type: "CACHE_URLS", urls }, [channel.port2]);
    }),
    REPLY_TIMEOUT_MS,
  );
  return reply ?? { ok: false, cached: 0, failed: urls.length, reason: "timeout" };
}
