import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo/url";

// House AI-crawler policy (personal-infra vercel-seo-triple): AI search and
// assistant crawlers are welcome, ByteDance's Bytespider is blocked.
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

// /api/ proxies Wikidata, Wikipedia and Claude: nothing to index, and every hit
// costs rate limit or money. A crawler that matches a named group ignores the
// "*" group, so each named group repeats the disallow.
const DISALLOW = ["/api/"];
// The Haunted Calendar feed is meant to be fetched by calendar apps; the longer
// allow rule wins over the /api/ disallow.
const ALLOW = ["/", "/api/calendar/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ALLOW, disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: ALLOW, disallow: DISALLOW })),
      { userAgent: "Bytespider", disallow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE.url,
  };
}
