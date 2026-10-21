// L5.2, gate 6: share links. Against a local production server:
//   pnpm build && NODE_USE_ENV_PROXY=1 pnpm start -p 3160
//   BASE_URL=http://localhost:3160 OUTAGE_BASE_URL=http://localhost:3169 pnpm test:e2e tests/e2e/share.spec.ts
// The outage tests use OUTAGE_BASE_URL (a server started with DISABLE_WIKIDATA=1),
// or start their own on port 3198 from a local build.
// What only prod can show: the real iMessage and Slack unfurls (Ben, gate 6).
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type APIResponse, type BrowserContext, type Page } from "@playwright/test";
import { seedHaunt } from "./fixtures/haunt";

const OAKLAND = "Q2008469";
const MITCHELL = "Q173540"; // died 1949: the carved card
const JACKSON = "Q3302990"; // died 2003: within 25 years, the plain card
const LAKE_VIEW = "Q872253"; // not a sample: no saved copy to fall back on in an outage
const BANK = "1a2b3c4d";

/** How link previews ask: Slack's unfurler, and iMessage (which sends this UA). Both get the metadata in <head>. */
const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const IMESSAGE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";

type Kind = {
  kind: "stop" | "tour" | "seance" | "party";
  path: string;
  cta: string;
  /** Where the one call to action goes. */
  href: string;
  /** Proves the page it lands on works, and isn't the "pick a haunt" gate. */
  landed: (page: Page) => Promise<void>;
};

const KINDS: Kind[] = [
  {
    kind: "stop",
    path: `/s/stop/${OAKLAND}/${MITCHELL}`,
    cta: "Open the tour at Oakland Cemetery",
    href: `/cemetery/${OAKLAND}`,
    landed: async (page) => {
      await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
      await expect(page.getByTestId("story-card").first()).toBeVisible({ timeout: 25_000 });
    },
  },
  {
    kind: "tour",
    path: `/s/tour/${OAKLAND}`,
    cta: "Open the tour at Oakland Cemetery",
    href: `/cemetery/${OAKLAND}`,
    landed: async (page) => {
      await expect(page.getByRole("heading", { level: 1, name: "Oakland Cemetery" })).toBeVisible({ timeout: 25_000 });
      await expect(page.getByTestId("story-card").first()).toBeVisible({ timeout: 25_000 });
    },
  },
  {
    kind: "seance",
    path: `/s/seance/${OAKLAND}/KXMPRT?b=${BANK}`,
    cta: "Join the séance",
    href: `/spirit?seance=KXMPRT&cemetery=${OAKLAND}&bank=${BANK}`,
    landed: async (page) => {
      await expect(page.getByRole("heading", { name: "Séance KXMPRT" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Join the séance" })).toBeVisible();
    },
  },
  {
    kind: "party",
    path: `/s/party/${OAKLAND}/KXMPRT`,
    cta: "Join the party",
    href: `/games/bingo?party=KXMPRT&cemetery=${OAKLAND}&name=Oakland+Cemetery&place=Atlanta`,
    landed: async (page) => {
      await expect(page.getByTestId("bingo-card").getByRole("button")).toHaveCount(25, { timeout: 15_000 });
      await expect(page.getByText("Party KXMPRT.")).toBeVisible();
    },
  },
];

function seenEtiquette() {
  try {
    localStorage.setItem("btt-etiquette-seen", "1");
  } catch {
    // Storage blocked: the card shows; tests would fail loudly.
  }
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seenEtiquette);
});

/** Width and height from a PNG's IHDR, after checking the signature. */
async function pngSize(res: APIResponse): Promise<{ width: number; height: number }> {
  const b = await res.body();
  expect([...b.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(b.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** The <head> a link preview sees: name/property → content. */
async function headMeta(request: APIRequestContext, path: string, ua = SLACKBOT): Promise<{ status: number; meta: Map<string, string>; canonical: string | null }> {
  const res = await request.get(path, { headers: { "User-Agent": ua } });
  const html = await res.text();
  const head = html.split("</head>")[0];
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\s[^>]*>/g) ?? []) {
    const key = tag.match(/\s(?:property|name)="([^"]+)"/)?.[1];
    const content = tag.match(/\scontent="([^"]*)"/)?.[1];
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content.replaceAll("&amp;", "&").replaceAll("&#x27;", "'"));
  }
  const canonical = head.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;
  return { status: res.status(), meta, canonical };
}

/** The canonical origin (lib/site.ts SITE.url): the sitemap is built on it. CANONICAL_URL pins it on prod. */
async function canonicalOrigin(request: APIRequestContext): Promise<string> {
  if (process.env.CANONICAL_URL) return new URL(process.env.CANONICAL_URL).origin;
  const xml = await (await request.get("/sitemap.xml")).text();
  return new URL(xml.match(/<loc>([^<]+)<\/loc>/)![1]).origin;
}

/** An absolute URL from the page, fetched from the server under test (the canonical origin may be prod). */
function onServer(absolute: string): string {
  const u = new URL(absolute);
  return `${u.pathname}${u.search}`;
}

test.describe("share landing pages", () => {
  for (const k of KINDS) {
    test(`${k.kind}: one call to action, the report link, and the action lands on a working page without a haunt`, async ({ page }) => {
      await page.goto(k.path);
      const main = page.locator("main");
      await expect(main.getByTestId("share-page")).toHaveAttribute("data-kind", k.kind);
      await expect(main.getByTestId("share-card")).toBeVisible();
      // Exactly one call to action: one primary pill on the page, and it's the share's.
      await expect(main.locator(".btn-primary")).toHaveCount(1);
      const cta = main.getByRole("link", { name: k.cta, exact: true });
      await expect(cta).toHaveCount(1);
      await expect(cta).toHaveClass(/\bbtn-primary\b/);
      await expect(cta).toHaveAttribute("href", k.href);
      // The takedown path: a GitHub issue on the repo with this page's address filled in.
      const report = main.getByRole("link", { name: "Report this page" });
      const reportUrl = new URL((await report.getAttribute("href"))!);
      expect(`${reportUrl.origin}${reportUrl.pathname}`).toBe("https://github.com/benskamps/between-two-tombstones/issues/new");
      expect(reportUrl.searchParams.get("body")).toContain(k.path.split("?")[0]);

      // A friend's link is never gated (decision 18e): this browser has no haunt.
      await cta.click();
      await expect(page).toHaveURL(new RegExp(`${k.href.replace(/[?+.]/g, "\\$&")}$`));
      await k.landed(page);
      await expect(page.getByTestId("pick-haunt")).toHaveCount(0);
    });
  }

  test("a stop shows the person, their dates and age, the cemetery and the death/life glyph pair", async ({ page }) => {
    await page.goto(`/s/stop/${OAKLAND}/${MITCHELL}`);
    const card = page.getByTestId("share-card");
    await expect(card).toHaveAttribute("data-style", "carved");
    await expect(card).toHaveClass(/\barch\b/);
    await expect(card.getByRole("heading", { name: "Margaret Mitchell" })).toBeVisible();
    await expect(card).toContainText("Nov 8, 1900 – Aug 16, 1949");
    await expect(card).toContainText("aged 48");
    expect(await card.locator("header svg").count()).toBe(2);
    await expect(card.getByRole("link", { name: "From Wikipedia, CC BY-SA 4.0" })).toHaveAttribute("href", /^https:\/\/en\.wikipedia\.org\/wiki\//);
  });

  test("a death within 25 years gets the plain card: no arch, no glyphs", async ({ page }) => {
    await page.goto(`/s/stop/${OAKLAND}/${JACKSON}`);
    const card = page.getByTestId("share-card");
    await expect(card).toHaveAttribute("data-style", "plain");
    await expect(card).not.toHaveClass(/\barch\b/);
    await expect(card.getByRole("heading", { name: "Maynard Jackson" })).toBeVisible();
    expect(await card.locator("svg").count()).toBe(0);
  });

  test("séance and party pages never name a person", async ({ page }) => {
    for (const path of [`/s/seance/${OAKLAND}/KXMPRT`, `/s/party/${OAKLAND}/KXMPRT`]) {
      await page.goto(path);
      await expect(page.getByTestId("share-room-code")).toHaveText("KXMPRT");
      const text = await page.locator("main").innerText();
      expect(text).toContain("Oakland Cemetery");
      for (const name of ["Margaret Mitchell", "Bobby Jones", "John B. Gordon", "Maynard Jackson"]) expect(text, `${path} names ${name}`).not.toContain(name);
    }
  });
});

test.describe("malformed and unknown links", () => {
  const BAD = [
    `/s/stop/q2008469/${MITCHELL}`, // lower-case QID
    `/s/stop/${OAKLAND}/Q42`, // Wikidata doesn't list Douglas Adams at Oakland
    `/s/tour/Q0`,
    `/s/tour/Q2008469x`,
    `/s/seance/${OAKLAND}/KXMPRI`, // I isn't in the room alphabet
    `/s/party/${OAKLAND}/kxmprt`,
    `/s/party/${OAKLAND}/KXMPRTT`,
  ];

  test("each one is the app's not-found page, never a crash; link previews get a 404", async ({ page, request }) => {
    for (const path of [...BAD, `/s/tour/${OAKLAND}/extra`, `/s/nope/${OAKLAND}`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), path).toBeVisible();
      await expect(page.locator('meta[name="robots"][content*="noindex"]').first(), path).toBeAttached();
      await expect(page.getByTestId("share-page"), path).toHaveCount(0);
      for (const ua of [SLACKBOT, IMESSAGE]) {
        const res = await request.get(path, { headers: { "User-Agent": ua } });
        expect(res.status(), `${path} for ${ua.slice(0, 12)}`).toBe(404);
      }
    }
  });

  test("their images are 404s too", async ({ request }) => {
    for (const path of BAD) {
      for (const image of ["opengraph-image", "story-image"]) {
        const res = await request.get(`${path}/${image}`);
        expect(res.status(), `${path}/${image}`).toBe(404);
      }
    }
  });
});

test.describe("share images", () => {
  for (const k of KINDS) {
    test(`${k.kind}: opengraph-image is a 1200×630 PNG and story-image a 1080×1920 PNG`, async ({ request }) => {
      const base = k.path.split("?")[0];
      const og = await request.get(`${base}/opengraph-image`);
      expect(og.status()).toBe(200);
      expect(og.headers()["content-type"]).toBe("image/png");
      expect(await pngSize(og)).toEqual({ width: 1200, height: 630 });
      // A full card, not the stand-in. Vercel's CDN keeps s-maxage for itself and strips it from what it
      // sends on; `next start` sends the header as written.
      const cacheControl = og.headers()["cache-control"];
      expect(cacheControl).toMatch(/(^|[\s,])max-age=3600\b/);
      if (!og.headers()["x-vercel-cache"]) expect(cacheControl).toContain("s-maxage=86400");
      const story = await request.get(`${base}/story-image`);
      expect(story.status()).toBe(200);
      expect(story.headers()["content-type"]).toBe("image/png");
      expect(await pngSize(story)).toEqual({ width: 1080, height: 1920 });
    });
  }

  test("a recent death gets the plain card; an old grave the carved one", async ({ request }) => {
    for (const image of ["opengraph-image", "story-image"]) {
      const plain = await request.get(`/s/stop/${OAKLAND}/${JACKSON}/${image}`);
      expect(plain.headers()["x-share-card"], image).toBe("plain");
      const carved = await request.get(`/s/stop/${OAKLAND}/${MITCHELL}/${image}`);
      expect(carved.headers()["x-share-card"], image).toBe("carved");
    }
    expect((await request.get(`/s/seance/${OAKLAND}/KXMPRT/opengraph-image`)).headers()["x-share-card"]).toBe("room");
    expect((await request.get(`/s/tour/${OAKLAND}/opengraph-image`)).headers()["x-share-card"]).toBe("tour");
  });
});

test.describe("unfurl metadata", () => {
  for (const k of KINDS) {
    test(`${k.kind}: og:image, og:title and summary_large_image on the canonical origin`, async ({ request }) => {
      const origin = await canonicalOrigin(request);
      for (const ua of [SLACKBOT, IMESSAGE]) {
        const { status, meta, canonical } = await headMeta(request, k.path, ua);
        expect(status).toBe(200);
        expect(meta.get("twitter:card")).toBe("summary_large_image");
        expect(meta.get("og:title")?.length).toBeGreaterThan(3);
        expect(meta.get("og:description")?.length).toBeGreaterThan(20);
        expect(meta.get("og:site_name")).toBe("Between Two Tombstones");
        for (const key of ["og:image", "twitter:image", "og:url"]) {
          const v = meta.get(key);
          expect(v, key).toBeTruthy();
          expect(new URL(v!).origin, key).toBe(origin);
        }
        expect(new URL(meta.get("og:url")!).pathname).toBe(k.path.split("?")[0]);
        expect(canonical && new URL(canonical).origin).toBe(origin);
        expect(meta.get("og:image:width")).toBe("1200");
        expect(meta.get("og:image:height")).toBe("630");
        expect(meta.get("og:image:type")).toBe("image/png");
        // The image the unfurl will fetch answers with the card.
        const img = await request.get(onServer(meta.get("og:image")!));
        expect(img.headers()["content-type"]).toBe("image/png");
        expect(await pngSize(img)).toEqual({ width: 1200, height: 630 });
      }
    });
  }

  test("a stop's title and description carry the name, dates and cemetery", async ({ request }) => {
    const { meta } = await headMeta(request, `/s/stop/${OAKLAND}/${MITCHELL}`);
    expect(meta.get("og:title")).toBe("Margaret Mitchell, Oakland Cemetery");
    expect(meta.get("og:description")).toContain("Nov 8, 1900 – Aug 16, 1949");
    expect(meta.get("og:description")).toContain("Oakland Cemetery, Atlanta");
  });

  test("a browser gets the same tags too (streamed with the page)", async ({ page }) => {
    await page.goto(`/s/tour/${OAKLAND}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  });
});

test.describe("making a share link", () => {
  async function recordShares(context: BrowserContext) {
    await context.addInitScript(() => {
      const w = window as unknown as { __shared: unknown[] };
      w.__shared = [];
      Object.defineProperty(navigator, "share", { value: async (d: unknown) => void w.__shared.push(d), configurable: true });
    });
  }
  const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: { url: string; title: string; text: string }[] }).__shared);

  test("each story card has a Share ghost pill that sends that stop's link", async ({ page, context }) => {
    await recordShares(context);
    await page.goto(`/cemetery/${OAKLAND}`);
    const card = page.getByTestId("story-card").first();
    await expect(card).toBeVisible({ timeout: 25_000 });
    const qid = await card.getAttribute("data-qid");
    const name = (await card.getByTestId("story-name").innerText()).trim();
    const share = card.getByRole("button", { name: `Share ${name}’s stop` });
    await expect(share).toHaveClass(/\bbtn-ghost\b/);
    await share.click();
    await expect(card.getByTestId("share-stop-status")).toHaveText("Shared.");
    const sent = await shared(page);
    expect(sent).toHaveLength(1);
    expect(new URL(sent[0].url).pathname).toBe(`/s/stop/${OAKLAND}/${qid}`);
    expect(sent[0].text).toContain("Oakland Cemetery");
  });

  test("the hub's “Share this tour” sends the tour's link; without a share sheet it copies it", async ({ page, context }) => {
    await recordShares(context);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/cemetery/${OAKLAND}`);
    const button = page.getByRole("button", { name: "Share this tour" });
    await expect(button).toBeVisible({ timeout: 25_000 });
    await expect(button).toHaveClass(/\bbtn-ghost\b/);
    await button.click();
    const sent = await shared(page);
    expect(new URL(sent[0].url).pathname).toBe(`/s/tour/${OAKLAND}`);

    // No share sheet: the link goes to the clipboard.
    await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
    await button.click();
    await expect(page.getByTestId("share-tour-status")).toHaveText("Link copied. Paste it into a message.");
    expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname).toBe(`/s/tour/${OAKLAND}`);
  });
});

test.describe("the Stamp Kit's share", () => {
  /** A stone photo in, stamps rendered (the stamp spec covers the kit itself). */
  async function stamps(page: Page, url: string) {
    await page.goto(url);
    await page.locator("#stamp-photo").setInputFiles(path.resolve("tests/fixtures/stones/SamuelSpencerGrave.jpg"));
    await expect(page.getByTestId("framer")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => Number((await page.getByTestId("previews").getAttribute("data-job")) || 0), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId("previews")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  }

  test("the files go from the phone with the tour's link; with a person in the address, that stop's link", async ({ page }) => {
    await seedHaunt(page);
    await page.addInitScript(() => {
      const w = window as unknown as { __shared: { files: number; url?: string }[] };
      w.__shared = [];
      Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
      Object.defineProperty(navigator, "share", {
        value: async (d: { files: File[]; url?: string }) => void w.__shared.push({ files: d.files.length, url: d.url }),
        configurable: true,
      });
    });
    const sent = () => page.evaluate(() => (window as unknown as { __shared: { files: number; url?: string }[] }).__shared);

    await stamps(page, "/stamp");
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByTestId("stamp-status")).toHaveText("Shared.");
    let last = (await sent()).at(-1)!;
    expect(last.files).toBe(4);
    expect(new URL(last.url!).pathname).toBe(`/s/tour/${OAKLAND}`);

    await stamps(page, `/stamp?cemetery=${OAKLAND}&name=Oakland+Cemetery&person=${MITCHELL}`);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByTestId("stamp-status")).toHaveText("Shared.");
    last = (await sent()).at(-1)!;
    expect(new URL(last.url!).pathname).toBe(`/s/stop/${OAKLAND}/${MITCHELL}`);
  });

  test("without file sharing: the kit sheet is saved and the link is there to copy", async ({ page, context }) => {
    await seedHaunt(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: () => false, configurable: true }));
    await stamps(page, "/stamp");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Share", exact: true }).click()]);
    expect(download.suggestedFilename()).toBe("headstone-kit-sheet.png");
    await expect(page.getByTestId("stamp-status")).toContainText("the kit sheet was saved and the link to the tour copied");
    expect(new URL(await page.getByTestId("stamp-link").inputValue()).pathname).toBe(`/s/tour/${OAKLAND}`);
    expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).pathname).toBe(`/s/tour/${OAKLAND}`);
  });
});

test.describe("share pages with Wikidata switched off (DISABLE_WIKIDATA=1)", () => {
  test.describe.configure({ mode: "serial" });
  let server: ChildProcess | undefined;
  let base = process.env.OUTAGE_BASE_URL ?? "";

  test.beforeAll(async () => {
    if (base) return;
    test.skip(!existsSync(".next/BUILD_ID"), "Needs a local `pnpm build`, or OUTAGE_BASE_URL pointing at a server started with DISABLE_WIKIDATA=1.");
    const port = 3198;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      env: { ...process.env, DISABLE_WIKIDATA: "1" },
      stdio: "ignore",
    });
    base = `http://localhost:${port}`;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`${base}/cemetery/saved`)).ok) return;
      } catch {
        // Not up yet.
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("The DISABLE_WIKIDATA server didn't start within 30 s.");
  });

  test.afterAll(() => {
    server?.kill();
  });

  test("a tour that isn't a sample names the outage, keeps its one way on, and draws a stand-in card", async ({ page, request }) => {
    await page.goto(`${base}/s/tour/${LAKE_VIEW}`);
    await expect(page.getByTestId("share-source-note")).toHaveText("Couldn't reach Wikidata. Try again in a minute, or open a saved tour.");
    await expect(page.getByRole("link", { name: "Open the tour", exact: true })).toHaveAttribute("href", `/cemetery/${LAKE_VIEW}`);
    const img = await request.get(`${base}/s/tour/${LAKE_VIEW}/opengraph-image`);
    expect(img.status()).toBe(200);
    expect(img.headers()["x-share-card"]).toBe("generic");
    expect(img.headers()["cache-control"]).toContain("max-age=60");
    expect(await pngSize(img)).toEqual({ width: 1200, height: 630 });
  });

  test("a séance still opens: the room code works, the cemetery just isn't named", async ({ page }) => {
    await page.goto(`${base}/s/seance/${LAKE_VIEW}/KXMPRT`);
    await expect(page.getByTestId("share-room-code")).toHaveText("KXMPRT");
    await expect(page.getByTestId("share-source-note")).toContainText("Couldn’t reach Wikidata to name the cemetery. The room code still works.");
    await expect(page.getByRole("link", { name: "Join the séance" })).toHaveAttribute("href", `/spirit?seance=KXMPRT&cemetery=${LAKE_VIEW}`);
  });

  test("a sample cemetery's stop still renders from the saved copy", async ({ page }) => {
    await page.goto(`${base}/s/stop/${OAKLAND}/${MITCHELL}`);
    await expect(page.getByTestId("share-card").getByRole("heading", { name: "Margaret Mitchell" })).toBeVisible();
  });
});
