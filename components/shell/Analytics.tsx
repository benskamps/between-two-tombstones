"use client";

// Vercel Web Analytics without the query string or the hash. Vercel's script
// reports `location.href` as the page, and our URLs can carry a visitor's
// position (/near?lat&lon&acc, the hub's ?via=here&lat&lon, the Gravitator's
// point). beforeSend runs on every pageview and custom event, so only the
// origin and the path ever leave the phone. Custom events keep their name and
// data (lib/share/analytics.ts); the spread keeps the payload the script
// passes alongside `url`.

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/** "https://x.app/near?lat=1&lon=2#top" → "https://x.app/near". */
export function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Module-level so its identity never changes (the SDK re-registers it when it does). */
export function stripEventUrl<E extends BeforeSendEvent>(event: E): E {
  return { ...event, url: withoutQuery(event.url) };
}

export function SiteAnalytics() {
  return <Analytics beforeSend={stripEventUrl} />;
}
