// Canonical site facts. NEXT_PUBLIC_SITE_URL is the canonical origin; it must
// match metadataBase or OG images break.
export const SITE = {
  name: "Between Two Tombstones",
  subtitle: "Macy's Graveyard Companion",
  description:
    "Find the graves worth visiting at any cemetery, take a walking tour, and read how those people lived.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  repo: "https://github.com/benskamps/between-two-tombstones",
} as const;

/** Sent to Wikimedia and OSM per their API policies. */
export const USER_AGENT = `BetweenTwoTombstones/0.1 (${SITE.repo})`;
