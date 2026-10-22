// Reads cost money, and a multipart POST is a "simple" request: any website can
// make its visitors' browsers send one here, without asking first (red team
// P2-4). Browsers say where a request comes from in Sec-Fetch-Site and Origin,
// so a request another site made is refused. A request without those headers
// (curl, tests, older browsers) goes through: the per-phone and per-network
// limits and the daily cap still apply to it.

import { SITE } from "@/lib/site";

/** The hosts a request of ours comes from: the host it was sent to, and the canonical site. */
function ownHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const add = (host: string | null | undefined) => {
    const h = host?.split(",")[0].trim().toLowerCase();
    if (h) hosts.add(h);
  };
  add(new URL(request.url).host);
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  try {
    add(new URL(SITE.url).host);
  } catch {
    // A malformed NEXT_PUBLIC_SITE_URL only means one host fewer.
  }
  return hosts;
}

/** True when a browser says another site sent this request. */
export function isCrossSite(request: Request): boolean {
  if (request.headers.get("sec-fetch-site")?.trim().toLowerCase() === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (origin === null) return false;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return true; // "null" (a sandboxed frame, a file) or garbage: not our page
  }
  return !host || !ownHosts(request).has(host);
}
