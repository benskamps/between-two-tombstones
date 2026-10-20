import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { NearMeButton } from "@/components/shell/NearMeButton";
import { CemeteryList, OsmOnlyList } from "@/components/tour/CemeteryList";
import { SearchForm } from "@/components/tour/SearchForm";
import { SourceFailure } from "@/components/tour/SourceFailure";
import { asDataSourceError } from "@/lib/data/errors";
import { combineNear, loadCemetery, loadNearOsm, loadNearWikidata, osmWithin } from "@/lib/data/load";
import type { NearbyCemetery } from "@/lib/data/types";
import { parseLatLon } from "@/lib/data/validate";

export const metadata: Metadata = {
  title: "Cemeteries near you",
  description: "Cemeteries within 10 km that have notable burials on Wikidata.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const WARM_MAX_KM = 1;
const WARM_MIN_BURIALS = 5;

export default function NearPage({ searchParams }: PageProps<"/near">) {
  return (
    <div className="space-y-5">
      <ServiceWorkerRegistrar />
      <h1 className="font-display text-3xl">Cemeteries near you</h1>
      <Suspense fallback={<p role="status">Looking for cemeteries within 10 km…</p>}>
        <NearResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NearResults({ searchParams }: Pick<PageProps<"/near">, "searchParams">) {
  const sp = await searchParams;
  const at = parseLatLon(one(sp.lat), one(sp.lon));
  if (!at.ok) {
    return (
      <div className="space-y-4">
        <p role="alert">{at.message} Tap below to use your location, or search by name.</p>
        <NearMeButton />
        <SearchForm />
      </div>
    );
  }

  let cemeteries: NearbyCemetery[];
  try {
    cemeteries = await loadNearWikidata(at.lat, at.lon);
  } catch (e) {
    unstable_rethrow(e);
    const err = asDataSourceError(e, "Wikidata");
    return <SourceFailure source={err.source} message={err.userMessage} retryHref={`/near?lat=${at.lat}&lon=${at.lon}`} />;
  }

  // Standing at a cemetery? Start loading its tour now so the tap opens fast.
  // Only the nearest one within 1 km with 5+ burials: Wikimedia's limits are tight.
  const nearest = cemeteries.find((c) => c.burials >= WARM_MIN_BURIALS);
  if (nearest && nearest.distanceKm <= WARM_MAX_KM) {
    const warming = loadCemetery(nearest.qid).catch(() => undefined);
    after(() => warming);
  }

  return (
    <div className="space-y-5">
      {cemeteries.length === 0 ? (
        <div className="space-y-3" data-testid="near-empty">
          <p>No cemeteries with Wikidata entries within 10 km. Try searching by name.</p>
          <SearchForm />
        </div>
      ) : (
        <>
          <p className="text-muted">
            {cemeteries.length} within 10 km, nearest first. The more people listed, the better the tour.
          </p>
          <CemeteryList items={cemeteries} label="Cemeteries within 10 km" />
        </>
      )}
      <Suspense fallback={<p className="text-sm text-muted">Checking OpenStreetMap for cemeteries Wikidata doesn&rsquo;t have…</p>}>
        <OsmExtras lat={at.lat} lon={at.lon} wikidata={cemeteries} />
      </Suspense>
    </div>
  );
}

/** Optional OpenStreetMap enrichment. Streams in after the list; a failure is named, never hidden. */
async function OsmExtras({ lat, lon, wikidata }: { lat: number; lon: number; wikidata: NearbyCemetery[] }) {
  const osm = await osmWithin(loadNearOsm(lat, lon));
  const merged = combineNear({ lat, lon }, wikidata, osm);
  if (!osm.ok) {
    return (
      <p className="text-sm text-muted" data-testid="osm-status">
        {osm.message}
      </p>
    );
  }
  if (merged.osmOnly.length === 0) return null;
  return (
    <section aria-labelledby="osm-title" className="space-y-2">
      <h2 id="osm-title" className="font-bold">
        Also mapped on OpenStreetMap
      </h2>
      <p className="text-sm text-muted">No tour for these: Wikidata doesn&rsquo;t list who&rsquo;s buried there.</p>
      <OsmOnlyList items={merged.osmOnly.slice(0, 10)} />
    </section>
  );
}
