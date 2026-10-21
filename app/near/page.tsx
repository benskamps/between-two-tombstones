import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { NearMeButton } from "@/components/shell/NearMeButton";
import { OsmOnlyList } from "@/components/tour/CemeteryList";
import { SearchForm } from "@/components/tour/SearchForm";
import { SourceFailure } from "@/components/tour/SourceFailure";
import { asDataSourceError } from "@/lib/data/errors";
import { combineNear, loadCemetery, loadNearOsm, loadNearWikidata, osmWithin } from "@/lib/data/load";
import { accuracyText, autoOpenTarget, bestNearby, hereHref, isApproximate, parseAccuracy, parseFlag, splitNear, warmTargets } from "@/lib/data/near";
import type { NearbyCemetery } from "@/lib/data/types";
import { parseLatLon } from "@/lib/data/validate";
import { BestNearby, NearLinkList, UnlistedFold } from "./NearList";

export const metadata: Metadata = {
  title: "Cemeteries near you",
  description: "Cemeteries within 10 km that have notable burials on Wikidata.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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

/** No location yet (or one we can't read): the two ways to give one. */
function AskForLocation({ invalid }: { invalid: boolean }) {
  return (
    <div className="space-y-4" data-testid="near-no-location">
      <p role={invalid ? "alert" : undefined}>
        {invalid ? "That link's location isn't one we can read. " : ""}Tap below to use your location, or search by name.
      </p>
      <NearMeButton />
      <SearchForm />
    </div>
  );
}

async function NearResults({ searchParams }: Pick<PageProps<"/near">, "searchParams">) {
  const sp = await searchParams;
  const rawLat = one(sp.lat);
  const rawLon = one(sp.lon);
  if (!rawLat?.trim() && !rawLon?.trim()) return <AskForLocation invalid={false} />;
  const at = parseLatLon(rawLat, rawLon);
  if (!at.ok) return <AskForLocation invalid />;
  const accuracyM = parseAccuracy(one(sp.acc));
  const listRequested = parseFlag(one(sp.list));

  let cemeteries: NearbyCemetery[];
  try {
    cemeteries = await loadNearWikidata(at.lat, at.lon);
  } catch (e) {
    unstable_rethrow(e);
    const err = asDataSourceError(e, "Wikidata");
    return <SourceFailure source={err.source} message={err.userMessage} retryHref={`/near?lat=${at.lat}&lon=${at.lon}`} />;
  }

  // "I'm here. Haunt me.": with a good fix (±300 m or better) and a cemetery
  // with 5+ people within about 300 m, skip the list and open its tour.
  const here = autoOpenTarget(cemeteries, accuracyM, listRequested);
  const best = bestNearby(cemeteries);

  // Start loading tours now so the tap opens fast: the nearest with 5+ people
  // within 1 km (an auto-open target is always that one), plus the pinned
  // "Best stories nearby" card unless we're auto-opening. At most one extra
  // cemetery per render; loadCemetery joins a load that is already running.
  for (const qid of warmTargets(cemeteries, here ? null : best)) {
    const warming = loadCemetery(qid).catch(() => undefined);
    after(() => warming);
  }
  if (here) redirect(hereHref(here.qid, at.lat, at.lon));

  const { listed, unlisted } = splitNear(cemeteries, best);
  const anyTour = Boolean(best) || listed.length > 0;

  return (
    <div className="space-y-5">
      {isApproximate(accuracyM) && (
        <p className="rounded-xl border border-border bg-surface p-3" data-testid="near-approx">
          <span className="font-bold">Your location is approximate ({accuracyText(accuracyM)}).</span> Pick your cemetery from the list, or
          search by name.
        </p>
      )}
      {cemeteries.length === 0 ? (
        <div className="space-y-3" data-testid="near-empty">
          <p>No cemeteries with Wikidata entries within 10 km. Try searching by name.</p>
          <SearchForm />
        </div>
      ) : (
        <>
          {best && <BestNearby cemetery={best} />}
          {listed.length > 0 && (
            <section aria-labelledby="near-listed-title" className="space-y-2">
              <h2 id="near-listed-title" className="font-bold">
                {best ? "Also nearby" : "Nearby"}
              </h2>
              <p className="text-sm text-muted">Nearest first. The more people listed, the better the tour.</p>
              <NearLinkList items={listed} label={best ? "Other cemeteries with people listed" : "Cemeteries with people listed"} />
            </section>
          )}
          {!anyTour && (
            <div className="space-y-3" data-testid="near-no-tours">
              <p>
                None of the cemeteries within 10 km lists anyone on Wikidata yet, so there&rsquo;s no tour here. Try searching by name for one
                farther away.
              </p>
              <SearchForm />
            </div>
          )}
          {unlisted.length > 0 && <UnlistedFold items={unlisted} more={anyTour} />}
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
