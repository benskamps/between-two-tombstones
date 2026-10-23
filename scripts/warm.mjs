// Fill a fresh deployment's caches with what the demo shows, before a judge does.
// Every build starts cold (next.config.ts), so the first visit to a sample tour
// can wait past its 12 s budget and get the saved copy instead of live data.
// One pass over a fixed list, one request at a time; each request gets 60 s.
// Usage: NODE_USE_ENV_PROXY=1 node scripts/warm.mjs [https://between-two-tombstones.vercel.app]
const base = (process.argv[2] ?? "https://between-two-tombstones.vercel.app").replace(/\/$/, "");
const TIMEOUT_MS = 60_000;

// The sample tours and the Gravitator's city decks (lib/gravitator/places.ts), then the pages that use them.
const CEMETERIES = ["Q2008469", "Q360779"];
const DECKS = [
  [33.7486, -84.3733],
  [32.0809, -81.0912],
  [29.9511, -90.0715],
  [41.0956, -73.8607],
];
const paths = [
  ...CEMETERIES.map((q) => `/api/cemeteries/${q}/burials`),
  ...DECKS.map(([lat, lon]) => `/api/gravitator?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`),
  "/",
  ...CEMETERIES.map((q) => `/cemetery/${q}`),
  "/gravitator",
  "/s/stop/Q2008469/Q173540",
];

let failed = 0;
for (const path of paths) {
  const started = Date.now();
  try {
    const res = await fetch(base + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.text();
    const origin = path.endsWith("/burials") ? ` origin=${JSON.parse(body).origin ?? "?"}` : "";
    if (!res.ok) failed++;
    console.log(`${res.status} ${((Date.now() - started) / 1000).toFixed(1)}s ${path}${origin}`);
  } catch (err) {
    failed++;
    console.log(`ERR ${((Date.now() - started) / 1000).toFixed(1)}s ${path}: ${err instanceof Error ? err.message : err}`);
  }
}
console.log(failed ? `${failed} of ${paths.length} requests failed. Run it again in a minute.` : `All ${paths.length} warm.`);
process.exitCode = failed ? 1 : 0;
