import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

// Hardening checks from the red-team pre-pass (10/22). Runs against BASE_URL
// (local `pnpm start`, a preview, or prod). Nothing here reaches Claude,
// Wikidata or Vercel Analytics: every analytics beacon is caught and aborted.

// The insights script lives at /_vercel/insights/script.js, or under a hashed
// base path (/<16 hex>/script.js on prod) when Vercel sets one. Its beacons are
// POSTs to …/view, …/event and …/session next to it; every such POST is caught.
const INSIGHTS_SCRIPT = /\/(_vercel\/insights|[0-9a-f]{16}(\/insights)?)\/script\.js$/;
const BEACON = /\/(view|event|session)$/;

// A service worker would hide the beacon from page.route(), so it stays off here.
test.use({ serviceWorkers: "block" });

/**
 * A stand-in for Vercel's insights script, used only when the server under test
 * doesn't serve the real one (a local `pnpm start`). It follows the script's
 * public contract as of v0.1.3: it drains window.vaq, takes a beforeSend
 * through window.va, and reports `location.href` as the page (the bug) unless
 * the reported path differs from the address bar.
 */
const STAND_IN = `(() => {
  const d = (document.currentScript && document.currentScript.dataset) || {};
  const base = d.endpoint || "/_vercel/insights";
  let before = (e) => e, path = null, route = null;
  const href = () => { const u = new URL(location.href); if (path && u.pathname !== path) { u.pathname = path; u.search = ""; } return u.href; };
  const send = (type, payload) => {
    const ev = before({ type, url: href(), payload });
    if (!ev) return;
    const p = ev.payload || payload;
    const body = { o: ev.url, ...(route ? { dp: route } : {}), ...(type === "event" && p ? { en: p.name, ed: p.data } : {}) };
    fetch(base + (type === "pageview" ? "/view" : "/event"), { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  };
  window.va = (name, arg) => {
    if (name === "beforeSend") before = arg;
    else if (name === "pageview") { if (arg && arg.route) route = arg.route; if (arg && arg.path) path = arg.path; send("pageview"); }
    else if (name === "event" && arg) send("event", { name: arg.name, data: arg.data });
  };
  (window.vaq || []).forEach(([n, a]) => window.va(n, a));
})();`;

type Beacon = { kind: string; body: string };

/** Serve the insights script (the real one when there is one) and catch every beacon. */
async function catchAnalytics(page: Page): Promise<{ beacons: Beacon[]; source: () => string }> {
  const beacons: Beacon[] = [];
  let source = "none";
  await page.route(BEACON, async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    beacons.push({ kind: new URL(route.request().url()).pathname.split("/").pop() ?? "", body: route.request().postData() ?? "" });
    await route.abort(); // never reaches Vercel
  });
  await page.route(INSIGHTS_SCRIPT, async (route: Route) => {
    // VA_SCRIPT_FILE: a saved copy of Vercel's real script, for local runs.
    const file = process.env.VA_SCRIPT_FILE;
    if (file) {
      source = "saved copy of the real script";
      return route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(file) });
    }
    const res = await route.fetch().catch(() => null);
    if (res && res.ok() && /javascript/.test(res.headers()["content-type"] ?? "")) {
      source = "the server's real script";
      return route.fulfill({ response: res });
    }
    source = "stand-in";
    return route.fulfill({ status: 200, contentType: "application/javascript", body: STAND_IN });
  });
  return { beacons, source: () => source };
}

test.describe("analytics never carries the visitor's position (P0-1)", () => {
  test.beforeEach(async ({ context }) => {
    // The real script stays silent for automated browsers; look like a phone.
    await context.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
  });

  test("the pageview and a share event report the path only, no lat=", async ({ page, baseURL }) => {
    const { beacons, source } = await catchAnalytics(page);
    await page.goto("/search?lat=33.74850&lon=-84.37330&acc=12#here");
    await expect.poll(() => beacons.filter((b) => b.kind === "view").length, { timeout: 15_000 }).toBeGreaterThan(0);
    // A custom event exactly as lib/share/analytics.ts sends one (track() → window.va("event", …)).
    await page.evaluate(() =>
      (window as unknown as { va: (n: string, a: unknown) => void }).va("event", { name: "share_created", data: { kind: "stop", via: "copy" } }),
    );
    await expect.poll(() => beacons.filter((b) => b.kind === "event").length, { timeout: 10_000 }).toBeGreaterThan(0);
    test.info().annotations.push({ type: "insights script", description: source() });

    const origin = new URL(baseURL!).origin;
    for (const b of beacons) {
      expect(b.body, `${b.kind} beacon`).not.toContain("lat=");
      expect(b.body).not.toContain("lon=");
      expect(b.body).not.toContain("acc=");
      expect(b.body).not.toContain("#here");
      expect(JSON.parse(b.body).o).toBe(`${origin}/search`);
    }
    const event = JSON.parse(beacons.find((b) => b.kind === "event")!.body);
    expect(event).toMatchObject({ en: "share_created", ed: { kind: "stop", via: "copy" } });
  });
});
