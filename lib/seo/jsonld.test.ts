import { describe, expect, it } from "vitest";
import sleepyHollow from "@/data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot } from "@/lib/types";
import {
  cemeteryJsonLd,
  personJsonLd,
  serializeJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
  wikidataDate,
} from "./jsonld";

const snapshot = sleepyHollow as CemeterySnapshot;
const byName = (name: string) => snapshot.people.find((p) => p.name === name)!;

describe("serializeJsonLd", () => {
  it("escapes < so a string can't close the script tag, and stays valid JSON", () => {
    const out = serializeJsonLd({ "@type": "Thing", name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("site schemas", () => {
  it("WebSite and SoftwareApplication carry schema.org context and absolute URLs", () => {
    for (const schema of [websiteJsonLd(), softwareApplicationJsonLd()]) {
      expect(schema["@context"]).toBe("https://schema.org");
      expect(String(schema.url)).toMatch(/^https?:\/\/[^/]+\/$/);
    }
    expect(websiteJsonLd()["@type"]).toBe("WebSite");
    expect(softwareApplicationJsonLd()["@type"]).toBe("SoftwareApplication");
  });
});

describe("wikidataDate", () => {
  it("keeps only the precision Wikidata states", () => {
    expect(wikidataDate("1783-04-03T00:00:00Z", 11)).toBe("1783-04-03");
    expect(wikidataDate("+1783-04-03T00:00:00Z", 10)).toBe("1783-04");
    expect(wikidataDate("1841-01-01T00:00:00Z", 9)).toBe("1841");
    expect(wikidataDate("1800-01-01T00:00:00Z", 8)).toBeUndefined();
    expect(wikidataDate(null, 11)).toBeUndefined();
  });
});

describe("personJsonLd", () => {
  it("builds Washington Irving from the snapshot without adding facts", () => {
    const irving = personJsonLd(byName("Washington Irving"));
    expect(irving).toMatchObject({
      "@type": "Person",
      name: "Washington Irving",
      birthDate: "1783-04-03",
      deathDate: "1859-11-28",
    });
    expect(String(irving.image)).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    expect(irving.sameAs).toEqual([
      "https://www.wikidata.org/wiki/Q181667",
      "https://en.wikipedia.org/wiki/Washington_Irving",
      "https://www.findagrave.com/memorial/531",
    ]);
  });

  it("does not turn a year-only birth into January 1", () => {
    expect(personJsonLd(byName("William Rockefeller")).birthDate).toBe("1841");
  });
});

describe("cemeteryJsonLd", () => {
  it("builds Sleepy Hollow with coordinates and identifiers", () => {
    const c = cemeteryJsonLd(snapshot.cemetery, "/c/sleepy-hollow-cemetery");
    expect(c).toMatchObject({
      "@type": "Cemetery",
      name: "Sleepy Hollow Cemetery",
      geo: { "@type": "GeoCoordinates", latitude: 41.096944444, longitude: -73.860277777 },
      containedInPlace: { "@type": "Place", name: "Sleepy Hollow" },
    });
    expect(String(c.url)).toMatch(/\/c\/sleepy-hollow-cemetery$/);
    expect(c.sameAs).toContain("https://www.findagrave.com/cemetery/66311");
  });
});
