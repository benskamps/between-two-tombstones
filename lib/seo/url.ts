import { SITE } from "@/lib/site";

/**
 * Absolute URL on the canonical origin (SITE.url, which is also metadataBase).
 * Uses URL resolution so a trailing slash on NEXT_PUBLIC_SITE_URL can't produce
 * "//sitemap.xml".
 */
export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE.url).toString();
}
