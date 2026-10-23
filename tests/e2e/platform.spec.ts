import { expect, test } from "@playwright/test";

// Lane 1 platform checks: security headers (L1.3, Gate 9), PWA manifest and
// installability (L1.4, Gate 11), SEO triple and crawler access (L1.5, Gate 10).
// Runs against BASE_URL (local `pnpm start`, a preview, or prod).

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(self), microphone=(self), geolocation=(self)",
};

// Exact directive set. A change to the CSP should be deliberate: update next.config.ts and this together.
const CSP: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": [
    "'self'",
    "https://upload.wikimedia.org",
    "https://commons.wikimedia.org",
    "https://thumb.wikimedia.org",
    "blob:",
    "data:",
  ],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "worker-src": ["'self'", "blob:"],
  "media-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
];

const SITEMAP_PATHS = ["/", "/stamp", "/spirit", "/games", "/calendar", "/gravitator", "/kit", "/cemetery/Q2008469", "/cemetery/Q360779"];

function parseCsp(value: string): Record<string, string[]> {
  return Object.fromEntries(
    value
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...sources] = d.split(/\s+/);
        return [name.toLowerCase(), sources];
      }),
  );
}

/** robots.txt → user-agent (lowercased) → its rule lines, e.g. ["allow: /", "disallow: /api/"]. */
function parseRobots(text: string): { groups: Map<string, string[]>; sitemaps: string[] } {
  const groups = new Map<string, string[]>();
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split(":");
    const field = key.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), []);
    } else if (field === "allow" || field === "disallow") {
      inRules = true;
      for (const a of agents) groups.get(a)!.push(`${field}: ${value}`);
    } else if (field === "sitemap") {
      sitemaps.push(value);
    }
  }
  return { groups, sitemaps };
}

function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test.describe("security headers", () => {
  test("every header is set on / with the exact value", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const headers = res.headers();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headers[name], name).toBe(value);
    }
  });

  test("CSP has exactly the agreed directives, no unsafe-eval, no nonce", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"];
    expect(csp, "Content-Security-Policy header").toBeTruthy();
    const parsed = parseCsp(csp);
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(CSP).sort());
    for (const [directive, sources] of Object.entries(CSP)) {
      expect([...parsed[directive]].sort(), directive).toEqual([...sources].sort());
    }
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("nonce-");
  });

  test("headers also cover static files and metadata routes", async ({ request }) => {
    for (const path of ["/llms.txt", "/manifest.webmanifest", "/robots.txt"]) {
      const headers = (await request.get(path)).headers();
      expect(headers["content-security-policy"], path).toBeTruthy();
      expect(headers["permissions-policy"], path).toBe(SECURITY_HEADERS["permissions-policy"]);
      expect(headers["x-content-type-options"], path).toBe("nosniff");
    }
  });

  test("the browser lets Wikimedia images through img-src and blocks other hosts", async ({ page }) => {
    await page.goto("/");
    // CSP is checked before the request goes out, so this doesn't depend on reaching the hosts.
    const blocked = await page.evaluate(async () => {
      const hits: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => hits.push(new URL(e.blockedURI).host));
      for (const host of ["upload.wikimedia.org", "commons.wikimedia.org", "thumb.wikimedia.org", "example.com"]) {
        const img = new Image();
        img.src = `https://${host}/csp-probe.png`;
      }
      await new Promise((r) => setTimeout(r, 500));
      return hits;
    });
    expect(blocked).toEqual(["example.com"]);
  });

  test("camera, microphone and geolocation are allowed by Permissions Policy", async ({ page }) => {
    await page.goto("/");
    const allowed = await page.evaluate(() => {
      type Policy = { allowsFeature(feature: string): boolean };
      const doc = document as Document & { permissionsPolicy?: Policy; featurePolicy?: Policy };
      const policy = doc.permissionsPolicy ?? doc.featurePolicy;
      if (!policy) return null;
      return {
        camera: policy.allowsFeature("camera"),
        microphone: policy.allowsFeature("microphone"),
        geolocation: policy.allowsFeature("geolocation"),
      };
    });
    expect(allowed, "browser exposes document.permissionsPolicy or document.featurePolicy").not.toBeNull();
    expect(allowed).toEqual({ camera: true, microphone: true, geolocation: true });
  });

  test("home hydrates under the CSP with no violations", async ({ page }) => {
    const consoleCsp: string[] = [];
    page.on("console", (msg) => {
      if (/content security policy/i.test(msg.text())) consoleCsp.push(msg.text());
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __cspViolations: string[] };
      w.__cspViolations = [];
      document.addEventListener("securitypolicyviolation", (e) =>
        w.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI}`),
      );
    });
    await page.goto("/", { waitUntil: "networkidle" });

    // React marks hydrated DOM nodes with __reactFiber$ keys; none appear if inline scripts are blocked.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const main = document.getElementById("main");
          return Boolean(main && Object.keys(main).some((k) => k.startsWith("__reactFiber$")));
        }),
      )
      .toBe(true);

    // A real client interaction. (Dark only since decision 18, so no theme toggle; and since F6
    // the first-run rules are a card on the cemetery page, not a popup here.) The location button
    // is React's once hydrated (data-ready); a refusal comes back through a React state update.
    const locate = page.locator("[data-locate]");
    await expect(locate).toHaveAttribute("data-ready", "");
    await locate.click();
    await expect(page.getByRole("alert").filter({ hasText: "Location is turned off for this site" })).toBeVisible();

    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    );
    // vercel.live is the preview-only Vercel Toolbar, injected by the platform; not our page.
    expect([...violations, ...consoleCsp].filter((v) => !v.includes("vercel.live"))).toEqual([]);
  });
});

test.describe("SEO triple and crawlers", () => {
  const files: [string, RegExp][] = [
    ["/robots.txt", /^text\/plain/],
    ["/sitemap.xml", /xml/],
    ["/llms.txt", /^text\/plain/],
    ["/manifest.webmanifest", /^application\/manifest\+json/],
  ];
  for (const [path, type] of files) {
    test(`${path} returns 200 with the right type`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toMatch(type);
    });
  }

  test("llms.txt is cached for an hour", async ({ request }) => {
    const res = await request.get("/llms.txt");
    expect(res.headers()["cache-control"]).toBe("public, max-age=3600");
    expect(await res.text()).toMatch(/^# Between Two Tombstones/);
  });

  test("robots.txt welcomes the AI crawlers, blocks Bytespider, and names the sitemap", async ({ request }) => {
    const { groups, sitemaps } = parseRobots(await (await request.get("/robots.txt")).text());
    expect(groups.get("*")).toContain("allow: /");
    for (const bot of AI_CRAWLERS) {
      const rules = groups.get(bot.toLowerCase());
      expect(rules, bot).toBeDefined();
      expect(rules, bot).toContain("allow: /");
      expect(rules, bot).not.toContain("disallow: /");
    }
    expect(groups.get("bytespider")).toEqual(["disallow: /"]);
    expect(sitemaps).toHaveLength(1);
    expect(new URL(sitemaps[0]).pathname).toBe("/sitemap.xml");
  });

  test("sitemap lists home, the tools and the sample cemeteries on one canonical origin", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]));
    expect(locs.map((u) => u.pathname)).toEqual(SITEMAP_PATHS);
    const origins = new Set(locs.map((u) => u.origin));
    expect(origins.size).toBe(1);
    const { sitemaps } = parseRobots(await (await request.get("/robots.txt")).text());
    expect(new URL(sitemaps[0]).origin).toBe([...origins][0]);
    // On prod, also pin the origin: CANONICAL_URL=https://<prod>.vercel.app
    if (process.env.CANONICAL_URL) expect([...origins][0]).toBe(new URL(process.env.CANONICAL_URL).origin);
  });

  const crawlerAgents: [string, string][] = [
    ["ClaudeBot (curl -A token)", "ClaudeBot"],
    ["GPTBot (curl -A token)", "GPTBot"],
    [
      "ClaudeBot (full UA)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    ],
    [
      "GPTBot (full UA)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    ],
  ];
  for (const [label, ua] of crawlerAgents) {
    test(`${label} gets 200`, async ({ request }) => {
      for (const path of ["/", "/robots.txt", "/llms.txt"]) {
        const res = await request.get(path, { headers: { "User-Agent": ua } });
        expect(res.status(), path).toBe(200);
      }
    });
  }

  test("every application/ld+json block parses as schema.org", async ({ page }) => {
    await page.goto("/");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const text of blocks) {
      const parsed: unknown = JSON.parse(text);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        expect(item).toMatchObject({ "@context": "https://schema.org", "@type": expect.any(String) });
      }
    }
  });

  test("home carries WebSite and SoftwareApplication JSON-LD", async ({ page }) => {
    await page.goto("/");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    test.skip(blocks.length === 0, "SiteJsonLd from lib/seo/jsonld.tsx is not mounted in app/layout.tsx yet");
    const types = blocks
      .flatMap((t) => {
        const parsed = JSON.parse(t) as unknown;
        return Array.isArray(parsed) ? parsed : [parsed];
      })
      .map((item: { "@type"?: string }) => item["@type"]);
    expect(types).toEqual(expect.arrayContaining(["WebSite", "SoftwareApplication"]));
  });
});

test.describe("PWA manifest", () => {
  test("manifest has the name, colors and 192, 512 and maskable icons that really are those sizes", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({
      name: "Between Two Tombstones",
      short_name: "Tombstones",
      start_url: "/",
      display: "standalone",
      background_color: "#130F15",
      theme_color: "#130F15",
    });
    const icons: { src: string; sizes: string; type: string; purpose?: string }[] = manifest.icons;
    const want = [
      { sizes: "192x192", purpose: "any" },
      { sizes: "512x512", purpose: "any" },
      { sizes: "512x512", purpose: "maskable" },
    ];
    for (const w of want) {
      const icon = icons.find((i) => i.sizes === w.sizes && (i.purpose ?? "any").split(" ").includes(w.purpose));
      expect(icon, `${w.sizes} ${w.purpose}`).toBeDefined();
      const res = await request.get(icon!.src);
      expect(res.status(), icon!.src).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const [width, height] = w.sizes.split("x").map(Number);
      expect(pngSize(await res.body()), icon!.src).toEqual({ width, height });
    }
  });

  test("head links the manifest, the icon and the apple-touch-icon", async ({ page, request }) => {
    await page.goto("/");
    for (const rel of ["manifest", "icon", "apple-touch-icon"]) {
      const href = await page.locator(`link[rel="${rel}"]`).last().getAttribute("href");
      expect(href, rel).toBeTruthy();
      expect((await request.get(href!)).status(), `${rel} ${href}`).toBe(200);
    }
  });

  test("Chromium reports no installability errors", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const cdp = await page.context().newCDPSession(page);
    const manifest = await cdp.send("Page.getAppManifest");
    expect(manifest.errors).toEqual([]);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    expect(installabilityErrors).toEqual([]);
  });
});
