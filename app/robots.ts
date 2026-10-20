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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
      { userAgent: "Bytespider", disallow: "/" },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE.url,
  };
}
