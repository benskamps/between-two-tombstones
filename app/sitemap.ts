import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/url";

// Home, the tools, and the two sample cemeteries (Oakland, Atlanta and Sleepy
// Hollow). Lane 5 adds the /c/* cemetery pages. No lastModified: we don't have
// a truthful date per page, and a fake "now" teaches crawlers to ignore it.
const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/stamp", priority: 0.8 },
  { path: "/spirit", priority: 0.8 },
  { path: "/games", priority: 0.8 },
  { path: "/calendar", priority: 0.6 },
  { path: "/gravitator", priority: 0.6 },
  { path: "/kit", priority: 0.6 },
  { path: "/cemetery/Q2008469", priority: 0.7 },
  { path: "/cemetery/Q360779", priority: 0.7 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency: "weekly",
    priority,
  }));
}
