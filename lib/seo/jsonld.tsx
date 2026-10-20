// JSON-LD structured data (schema.org), per the house vercel-seo-triple skill
// and node_modules/next/dist/docs/01-app/02-guides/json-ld.md.
//
// Mount <SiteJsonLd /> once in the root layout. Lane 5 uses cemeteryJsonLd and
// personJsonLd on cemetery pages: <JsonLd data={[cemeteryJsonLd(c, path), ...people.map(personJsonLd)]} />.

import { SITE } from "@/lib/site";
import { parsePoint, type Cemetery, type Person } from "@/lib/types";
import { absoluteUrl } from "@/lib/seo/url";

export type JsonLdObject = { "@context"?: string; "@type": string } & Record<string, unknown>;

const CONTEXT = "https://schema.org";

/**
 * Serialize for an inline <script>. "<" becomes < so a string containing
 * "</script>" or "<!--" can't break out of the tag (still valid JSON).
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Renders one application/ld+json block. A plain <script>, not next/script: it's data, not code. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    name: SITE.name,
    alternateName: SITE.subtitle,
    url: absoluteUrl("/"),
    description: SITE.description,
    inLanguage: "en-US",
  };
}

export function softwareApplicationJsonLd(): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    "@id": absoluteUrl("/#app"),
    name: SITE.name,
    alternateName: SITE.subtitle,
    description: SITE.description,
    url: absoluteUrl("/"),
    applicationCategory: "TravelApplication",
    operatingSystem: "Web browser (installable as a PWA on Android, iOS and desktop)",
    image: absoluteUrl("/icons/icon-512.png"),
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isPartOf: { "@id": absoluteUrl("/#website") },
  };
}

/** WebSite + SoftwareApplication, for the root layout. */
export function SiteJsonLd() {
  return <JsonLd data={[websiteJsonLd(), softwareApplicationJsonLd()]} />;
}

/** Wikidata gives Commons URLs as http://; pages are https, and the CSP img-src lists https hosts only. */
function https(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/^http:\/\//, "https://");
}

/**
 * Wikidata timestamp + precision → schema.org Date text.
 * 11 = day (1783-04-03), 10 = month (1783-04), 9 = year (1783). Coarser
 * precisions and BCE dates are left out rather than guessed.
 */
export function wikidataDate(value: string | null, precision: number | null): string | undefined {
  const m = value?.match(/^\+?(\d{4})-(\d{2})-(\d{2})/);
  if (!m || precision === null) return undefined;
  if (precision >= 11) return `${m[1]}-${m[2]}-${m[3]}`;
  if (precision === 10) return `${m[1]}-${m[2]}`;
  if (precision === 9) return m[1];
  return undefined;
}

function compact(values: (string | undefined | null)[]): string[] {
  return values.filter((v): v is string => Boolean(v));
}

/** Drop undefined keys and empty arrays so the output stays tidy. */
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  );
}

/**
 * schema.org Cemetery for a cemetery page.
 * @param path the page's path on this site, e.g. "/c/sleepy-hollow-cemetery".
 */
export function cemeteryJsonLd(cemetery: Cemetery, path: string): JsonLdObject {
  const point = parsePoint(cemetery.coord);
  return {
    "@context": CONTEXT,
    "@type": "Cemetery",
    ...clean({
      "@id": absoluteUrl(`${path}#cemetery`),
      name: cemetery.name,
      description: cemetery.description ?? undefined,
      url: absoluteUrl(path),
      geo: point ? { "@type": "GeoCoordinates", latitude: point.lat, longitude: point.lon } : undefined,
      containedInPlace: cemetery.locatedIn ? { "@type": "Place", name: cemetery.locatedIn } : undefined,
      sameAs: compact([
        `https://www.wikidata.org/wiki/${cemetery.qid}`,
        https(cemetery.enwiki),
        cemetery.findAGraveCemeteryId
          ? `https://www.findagrave.com/cemetery/${cemetery.findAGraveCemeteryId}`
          : undefined,
      ]),
    }),
  };
}

/** schema.org Person for someone buried at a cemetery we show. Facts come only from the Person record. */
export function personJsonLd(person: Person): JsonLdObject {
  return {
    "@context": CONTEXT,
    "@type": "Person",
    ...clean({
      name: person.name,
      description: person.description ?? undefined,
      birthDate: wikidataDate(person.birth, person.birthPrecision),
      deathDate: wikidataDate(person.death, person.deathPrecision),
      image: https(person.image),
      hasOccupation: person.occupations.map((name) => ({ "@type": "Occupation", name })),
      sameAs: compact([
        `https://www.wikidata.org/wiki/${person.qid}`,
        https(person.wikipedia?.url),
        person.findAGraveId ? `https://www.findagrave.com/memorial/${person.findAGraveId}` : undefined,
      ]),
    }),
  };
}
