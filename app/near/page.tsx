import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { NearMeButton } from "@/components/shell/NearMeButton";
import { OsmOnlyList } from "@/components/tour/CemeteryList";
import { SearchForm } from "@/components/tour/SearchForm";
import { SourceFailure } from "@/components/tour/SourceFailure";
import { PageHeader } from "@/components/ui/Motifs";
import { Sprout } from "@/components/ui/symbols";
import { asDataSourceError } from "@/lib/data/errors";
import { combineNear, loadCemetery, loadNearOsm, loadNearWikidata, osmWithin } from "@/lib/data/load";
import { accuracyText, autoOpenTarget, bestNearby, groupNear, hereHref, isApproximate, parseAccuracy, parseFlag, urlCoord, warmTargets } from "@/lib/data/near";
import type { NearbyCemetery } from "@/lib/data/types";
import { parseLatLon } from "@/lib/data/validate";
import { BestNearby, NearFold, NearLinkList } from "./NearList";

export const metadata: Metadata = {
  title: "Cemeteries near you",
  description: "Cemeteries within 10 km that have notable burials on Wikidata.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function NearPage({ searchParams }: PageProps<"/near">) {
  return (
    <div className="space-y-5">
      <ServiceWorkerRegistrar />
      <PageHeader title="Cemeteries near you" tool="search" life={<Sprout className="h-5 w-5" />} />
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
    return <SourceFailure source={err.source} message={err.userMessage} retryHref={`/near?lat=${urlCoord(at.lat)}&lon=${urlCoord(at.lon)}`} />;
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
  if (here) redirect(hereHref(here.qid, at.lat, at.lon, here.burials));

  // Cards only for 5+ people; fewer are folded with the empty ones (review 4, #5).
  const { cards, few, unlisted } = groupNear(cemeteries, best);
  const anyTour = Boolean(best) || cards.length > 0;

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
          {cards.length > 0 && (
            <section aria-labelledby="near-listed-title" className="space-y-2">
              <h2 id="near-listed-title" className="font-display text-2xl leading-tight">
                {best ? "Also nearby" : "Nearby"}
              </h2>
              <p className="text-sm text-muted">Nearest first. The more people listed, the better the tour.</p>
              <NearLinkList items={cards} label={best ? "Other cemeteries with people listed" : "Cemeteries with people listed"} />
            </section>
          )}
          {!anyTour && (
            <div className="space-y-3" data-testid="near-no-tours">
              {few.length > 0 ? (
                <p>
                  None of the cemeteries within 10 km lists 5 or more people on Wikidata, so every tour here is short. Search by name for a bigger
                  one farther away, or open a short one below.
                </p>
              ) : (
                <p>
                  None of the cemeteries within 10 km lists anyone on Wikidata yet, so there&rsquo;s no tour here. Try searching by name for one
                  farther away.
                </p>
              )}
              <SearchForm />
            </div>
          )}
          {few.length + unlisted.length > 0 && <NearFold few={few} unlisted={unlisted} more={anyTour} open={!anyTour && few.length > 0} />}
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
      <h2 id="osm-title" className="font-display text-2xl leading-tight">
        Also mapped on OpenStreetMap
      </h2>
      <p className="text-sm text-muted">No tour for these: Wikidata doesn&rsquo;t list who&rsquo;s buried there.</p>
      <OsmOnlyList items={merged.osmOnly.slice(0, 10)} />
    </section>
  );
}
