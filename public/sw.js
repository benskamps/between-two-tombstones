/* Between Two Tombstones service worker (Lane 2, L2.6).
 *
 * - App shell ("/" and the offline tour shell "/cemetery/saved") is precached
 *   with the scripts its HTML references.
 * - Pages: network first; on failure the cached copy (visited or downloaded).
 *   A tour page with no cached copy redirects to /cemetery/saved?qid=…, which
 *   renders the tour from IndexedDB.
 * - /_next/static: cache first (file names are content-hashed).
 * - Never cached: /api/*, Next router data (RSC) requests, other origins
 *   (Commons photos are opaque cross-origin responses; cards read fine without).
 * - "Download this tour" posts CACHE_URLS with the page and its scripts.
 * Cache names carry VERSION; activate deletes older ones. Every cache is capped.
 */

const VERSION = "v1";
const SHELL = `btt-shell-${VERSION}`;
const PAGES = `btt-pages-${VERSION}`;
const STATIC = `btt-static-${VERSION}`;
const CURRENT = [SHELL, PAGES, STATIC];
const SHELL_URLS = ["/", "/cemetery/saved"];
const LIMITS = { [PAGES]: 40, [STATIC]: 250 };
const MAX_MESSAGE_URLS = 150;
const MAX_ASSETS_PER_PAGE = 120;
/** Only when a cached copy exists: on bad signal, don't wait forever for the network. */
const NAV_TIMEOUT_MS = 8000;
/** Pages showing a failure carry this marker and are never cached. */
const NO_CACHE_MARKER = "data-btt-nocache";

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Between Two Tombstones</title>
<style>body{font:1.1rem/1.5 system-ui,sans-serif;background:#130f15;color:#f1eadf;margin:0;padding:1.5rem;max-width:40rem;color-scheme:dark}a{color:#d6bae6;display:inline-block;min-height:48px;line-height:48px}</style></head>
<body><h1>You're offline</h1><p>This page wasn't saved on your phone. Tours you downloaded still open without a signal.</p><p><a href="/cemetery/saved">Open saved tours</a></p></body></html>`;

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isHtml(res) {
  return (res.headers.get("content-type") || "").includes("text/html");
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function assetUrlsIn(html) {
  const found = new Set();
  const re = /\/_next\/static\/[^"'\s)\\<>]+/g;
  let m;
  while ((m = re.exec(html)) && found.size < MAX_ASSETS_PER_PAGE) found.add(m[0]);
  return [...found];
}

async function cacheAssets(urls) {
  const cache = await caches.open(STATIC);
  for (const u of urls) {
    try {
      if (await cache.match(u)) continue;
      const res = await fetch(u);
      if (res.ok) await cache.put(u, res);
    } catch {
      // One missing chunk shouldn't stop the rest.
    }
  }
}

/** Fetch a page and store it unless it's a failure page. Returns true when stored. */
async function storePage(cacheName, url) {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
  if (!res.ok || !isHtml(res)) return false;
  const html = await res.clone().text();
  if (html.includes(NO_CACHE_MARKER)) return false;
  const cache = await caches.open(cacheName);
  await cache.delete(url);
  await cache.put(url, res);
  await cacheAssets(assetUrlsIn(html));
  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      for (const url of SHELL_URLS) {
        try {
          await storePage(SHELL, url);
        } catch {
          // Offline during install: the shell gets cached on the next visit.
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("btt-") && !CURRENT.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function cachedPage(request) {
  const opts = { ignoreVary: true };
  return (await caches.match(request, { ...opts, cacheName: PAGES })) || (await caches.match(request, { ...opts, cacheName: SHELL }));
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirstPage(event) {
  const request = event.request;
  const url = new URL(request.url);
  const cached = await cachedPage(request);
  try {
    const network = fetch(request);
    network.catch(() => {}); // Losing the race to the timeout isn't an error.
    const res = cached ? await Promise.race([network, timeout(NAV_TIMEOUT_MS)]) : await network;
    if (res.ok && isHtml(res) && !res.redirected) {
      const copy = res.clone();
      event.waitUntil(
        (async () => {
          const html = await copy.clone().text();
          if (html.includes(NO_CACHE_MARKER)) return;
          const cache = await caches.open(SHELL_URLS.includes(url.pathname) && !url.search ? SHELL : PAGES);
          await cache.delete(request, { ignoreVary: true });
          await cache.put(request, copy);
          await trim(PAGES, LIMITS[PAGES]);
        })().catch(() => {}),
      );
    }
    return res;
  } catch {
    if (cached) return cached;
    const tour = url.pathname.match(/^\/cemetery\/(Q[1-9]\d{0,11})$/i);
    if (tour && (await caches.match("/cemetery/saved", { ignoreSearch: true, ignoreVary: true }))) {
      return Response.redirect(`/cemetery/saved?qid=${tour[1].toUpperCase()}`, 302);
    }
    if (url.pathname === "/cemetery/saved") {
      const shell = await caches.match("/cemetery/saved", { ignoreSearch: true, ignoreVary: true });
      if (shell) return shell;
    }
    return new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) {
    const copy = res.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trim(STATIC, LIMITS[STATIC])).catch(() => {}));
  }
  return res;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request, { ignoreVary: true });
  const refresh = fetch(event.request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        return cache.put(event.request, copy).then(() => trim(STATIC, LIMITS[STATIC])).then(() => res);
      }
      return res;
    });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(event));
    return;
  }
  // Next's router data requests vary by headers; let them go to the network.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(event));
    return;
  }
  if (url.pathname.startsWith("/_next/")) return;
  event.respondWith(staleWhileRevalidate(event));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  const port = event.ports && event.ports[0];
  event.waitUntil(
    (async () => {
      let cached = 0;
      let failed = 0;
      let pagesOk = true;
      const assets = [];
      for (const raw of data.urls.slice(0, MAX_MESSAGE_URLS)) {
        let url;
        try {
          url = new URL(raw, self.location.origin);
        } catch {
          failed++;
          continue;
        }
        if (!isSameOrigin(url)) {
          failed++;
          continue;
        }
        if (url.pathname.startsWith("/_next/static/")) {
          assets.push(url.pathname + url.search);
          continue;
        }
        try {
          const target = SHELL_URLS.includes(url.pathname) && !url.search ? SHELL : PAGES;
          if (await storePage(target, url.pathname + url.search)) cached++;
          else {
            failed++;
            pagesOk = false;
          }
        } catch {
          failed++;
          pagesOk = false;
        }
      }
      await cacheAssets(assets);
      cached += assets.length;
      await trim(PAGES, LIMITS[PAGES]);
      await trim(STATIC, LIMITS[STATIC]);
      if (port) port.postMessage({ ok: pagesOk, cached, failed });
    })().catch(() => {
      if (port) port.postMessage({ ok: false, cached: 0, failed: data.urls.length, reason: "error" });
    }),
  );
});
