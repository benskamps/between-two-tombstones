import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/*
  Content Security Policy. This file is the one source for security headers
  (no vercel.json headers, no proxy).

  script-src: 'self' 'unsafe-inline', no nonce.
  Every App Router page ships inline <script> tags (the React streaming runtime
  and the RSC flight data, `self.__next_f.push(...)`), so 'self' alone stops
  hydration. Next's two ways around that both cost us:
  - A per-request nonce (via proxy) forces every page to render dynamically:
    no static prerendering, no Cache Components static shell, no CDN caching.
    The Next CSP guide says so outright, and PPR is incompatible with nonces.
  - Hashes can't work because the flight data differs per page and per build.
    Experimental SRI only covers external chunks, not those inline scripts.
  So we keep pages prerendered and accept 'unsafe-inline' for scripts. What
  still holds: no 'unsafe-eval' in production, scripts only from our origin
  (no third-party script hosts), connect-src 'self' (every external API goes
  through our routes), object-src 'none', base-uri 'self', form-action 'self'
  and frame-ancestors 'none'. React escapes rendered text, and JSON-LD is
  serialized with "<" escaped (lib/seo/jsonld.tsx).

  style-src needs 'unsafe-inline' because Next renders inline style attributes
  (next/image emits style="color:transparent" and, with `fill`, positioning).

  Development only: React needs 'unsafe-eval' for its debug stacks, and
  <Analytics/> loads its debug script from va.vercel-scripts.com. In production
  Analytics loads /_vercel/insights/script.js from our own origin.
*/
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Commons Special:FilePath redirects to upload.wikimedia.org (original size)
  // or, with ?width=N, to thumb.wikimedia.org (scaled).
  "img-src 'self' https://upload.wikimedia.org https://commons.wikimedia.org https://thumb.wikimedia.org blob: data:",
  // next/font self-hosts the Google fonts under /_next/static/media.
  "font-src 'self'",
  "connect-src 'self'",
  // Stamp Kit workers and spirit box / EVP audio.
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app needs all three: the Stamp Kit camera, the EVP recorder mic and
  // "near me". Never copy a template's camera=(), microphone=(), geolocation=().
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Every build starts cold. On 10/21 a production build on Vercel restored the previous
  // build's Turbopack cache and shipped stale CSS (the app's own rules missing). On 10/22 a
  // local build did the same: an edited .bingo-tile rule in globals.css never reached the
  // stylesheet, and an e2e test failed against the old CSS.
  experimental: { turbopackFileSystemCacheForBuild: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // llms.txt is a static file in public/; keep it fresh for crawlers.
      { source: "/llms.txt", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }] },
    ];
  },
};

export default nextConfig;
