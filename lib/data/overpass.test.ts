import { afterEach, describe, expect, it, vi } from "vitest";
import nearLakeViewJson from "./__fixtures__/sparql-near-lakeview.json";
import osmJson from "./__fixtures__/overpass-lakeview.synthetic.json";
import { DataSourceError } from "./errors";
import { fetchOsmCemeteries, mergeOsm, normalizeName, OVERPASS_MIRRORS, overpassQuery, parseOverpass } from "./overpass";
import { parsePoint } from "@/lib/types";
import { flattenBindings, parseNearRows } from "./wikidata";
import { setTransportForTests } from "./wikimedia";

afterEach(() => setTransportForTests(null));

const center = { lat: 47.6339, lon: -122.3158 };

describe("Overpass", () => {
  it("asks for cemeteries and grave yards around the point", () => {
    const q = overpassQuery(47.6339, -122.3158, 10000);
    expect(q).toContain('nwr["landuse"="cemetery"](around:10000,47.6339,-122.3158)');
    expect(q).toContain('nwr["amenity"="grave_yard"]');
    expect(q).toContain("out tags center");
  });

  it("parses elements, using the center of ways and relations and skipping ones without a location", () => {
    const list = parseOverpass(osmJson);
    expect(list).toHaveLength(5);
    expect(list[0]).toEqual({ osmId: "way/1001", name: "Lake View Cemetery", wikidata: "Q872253", lat: 47.6337, lon: -122.3158 });
    expect(list.find((c) => c.osmId === "way/1004")?.name).toBeNull();
  });

  it("falls back through the mirrors in order", async () => {
    const hosts: string[] = [];
    const responses: (Response | Error)[] = [
      Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }),
      new Response("Gateway Timeout", { status: 504 }),
      new Response(JSON.stringify(osmJson), { status: 200 }),
    ];
    setTransportForTests({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        hosts.push(new URL(String(input)).host);
        expect(init?.method).toBe("POST");
        const next = responses.shift()!;
        if (next instanceof Error) throw next;
        return next;
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    const r = await fetchOsmCemeteries(center.lat, center.lon, 10);
    expect(hosts).toEqual(OVERPASS_MIRRORS.map((m) => new URL(m).host));
    expect(r.mirror).toBe("overpass.private.coffee");
    expect(r.cemeteries.length).toBe(5);
  });

  it("names every mirror when all of them fail", async () => {
    setTransportForTests({
      fetch: vi.fn(async () => {
        throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ETIMEDOUT" } });
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    const err = await fetchOsmCemeteries(center.lat, center.lon, 10).catch((e) => e);
    expect(err).toBeInstanceOf(DataSourceError);
    expect(err.source).toBe("OpenStreetMap");
    for (const m of OVERPASS_MIRRORS) expect(err.detail).toContain(new URL(m).host);
  });

  it("merges by QID, then by name nearby; keeps named OSM-only cemeteries separately", () => {
    const wikidata = parseNearRows(flattenBindings(nearLakeViewJson));
    const merged = mergeOsm(wikidata, parseOverpass(osmJson), center, (c) => parsePoint(c.coord));
    // Same Wikidata list, nothing added or lost.
    expect(merged.cemeteries.map((c) => c.qid)).toEqual(wikidata.map((c) => c.qid));
    expect(merged.cemeteries.find((c) => c.qid === "Q872253")?.osmId).toBe("way/1001");
    expect(merged.cemeteries.find((c) => c.name === "Grand Army of the Republic Cemetery")?.osmId).toBe("way/1002");
    // "Lakeview Cemetery" 7 km away is a different place: not merged into Lake View.
    const osmOnlyNames = merged.osmOnly.map((c) => c.name);
    expect(osmOnlyNames).toContain("Example Pioneer Burial Ground");
    expect(osmOnlyNames).toContain("Lakeview Cemetery");
    expect(osmOnlyNames).not.toContain(null);
    expect(merged.osmOnly[0].distanceKm).toBeGreaterThan(0);
  });

  it("normalizes names for matching", () => {
    expect(normalizeName("Lake View Cemetery")).toBe(normalizeName("Lakeview  cemetery"));
    expect(normalizeName("Cimetière du Père-Lachaise")).toBe("cimetieredupere" + "lachaise");
  });
});
