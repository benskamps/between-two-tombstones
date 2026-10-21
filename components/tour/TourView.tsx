"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { HauntToolkit } from "@/components/haunt/HauntToolkit";
import { useHub } from "@/components/haunt/useHub";
import { DownloadTourButton } from "@/components/offline/DownloadTourButton";
import { useOnline, useWakeLock, useWatchPosition } from "@/components/offline/hooks";
import { getPins, getSavedTour, type Pin } from "@/components/offline/store";
import type { DataSource } from "@/lib/data/errors";
import type { BurialsResponse } from "@/lib/data/types";
import { countEligible } from "@/lib/haunt/eligibility";
import { forgetNext } from "@/lib/haunt/next";
import { EtiquetteNotice } from "@/components/shell/EtiquetteNotice";
import { buildStops, canRoute, locatedGraves, MIN_ROUTE_STOPS, MODES, PAGE_SIZE, type Mode } from "@/lib/tour/modes";
import { distanceM } from "@/lib/tour/route";
import { rankPeople } from "@/lib/tour/score";
import { SourceFailure } from "./SourceFailure";
import { StoryCard } from "./StoryCard";
import { TourHeader, TourLinks } from "./TourHeader";

export type TourData = BurialsResponse;

type Props = {
  qid: string;
  /** Server-loaded tour; null when the live call failed with no saved copy. */
  initial: TourData | null;
  error: { source: DataSource; message: string } | null;
  /** Shown instead of the source failure when there's no data and no saved copy. */
  fallback?: ReactNode;
};

function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "earlier" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function TourView({ qid, initial, error, fallback }: Props) {
  const online = useOnline();
  const [data, setData] = useState<TourData | null>(initial);
  // Set when the tour on screen came from this phone's IndexedDB copy.
  const [deviceCopyAt, setDeviceCopyAt] = useState<string | null>(null);
  const [checkingDevice, setCheckingDevice] = useState(initial === null);
  const [pins, setPins] = useState<Record<string, Pin>>({});
  const [mode, setMode] = useState<Mode>("hits");
  const [count, setCount] = useState(PAGE_SIZE);
  const [walking, setWalking] = useState(false);
  const [now] = useState(() => new Date());

  // Offline, or no server data: read the downloaded copy from IndexedDB.
  useEffect(() => {
    let live = true;
    if (initial === null || !navigator.onLine) {
      getSavedTour(qid).then((saved) => {
        if (!live) return;
        if (saved) {
          setData({ ...saved.data, origin: "saved", warnings: [] });
          setDeviceCopyAt(saved.savedAt);
        }
        setCheckingDevice(false);
      });
    }
    getPins(qid).then((p) => {
      if (live) setPins(p);
    });
    return () => {
      live = false;
    };
  }, [qid, initial]);

  // The hub: opening a cemetery makes it your haunt (decision 18e; F11 decides when), live or from the saved copy.
  const hub = useHub(data ? data.cemetery : null);
  const eligible = useMemo(() => countEligible(data?.people ?? [], now), [data, now]);

  const wakeLockHeld = useWakeLock(true);
  const { position, first, error: positionError, reset } = useWatchPosition(walking);

  const ranked = useMemo(() => (data ? rankPeople(data.people, { now, cemeteryName: data.cemetery.name }) : []), [data, now]);
  const located = useMemo(() => (data ? locatedGraves(data.people, pins) : new Map()), [data, pins]);
  const routeOk = canRoute(located);
  const tour = useMemo(() => buildStops(ranked, mode, count, located, first), [ranked, mode, count, located, first]);

  if (!data) {
    if (checkingDevice) {
      return (
        <p className="text-muted" data-btt-nocache="">
          Looking for a copy saved on this phone…
        </p>
      );
    }
    if (fallback) return fallback;
    return <SourceFailure source={error?.source ?? "Wikidata"} message={error?.message ?? "Couldn't load this tour."} retryHref={`/cemetery/${qid}`} />;
  }

  const visibleModes = MODES.filter((m) => m.id !== "route" || routeOk);
  const storiesIncomplete = data.warnings.some((w) => w.code === "stories-missing");
  const located3 = Math.min(located.size, MIN_ROUTE_STOPS);

  function startWalk() {
    // Ask for location from the tap (never on load), then keep watching while visible.
    reset();
    navigator.geolocation?.getCurrentPosition(
      () => {},
      () => {},
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
    setWalking(true);
  }

  const card = (s: (typeof tour.stops)[number], i: number) => {
    const at = located.get(s.person.qid);
    return (
      <li key={s.person.qid}>
        <StoryCard
          scored={s}
          stop={i + 1}
          cemeteryQid={data.cemetery.qid}
          cemeteryName={data.cemetery.name}
          pin={pins[s.person.qid]}
          onPinsChange={setPins}
          distanceM={position && at ? distanceM(position, at) : null}
          now={now}
          storiesIncomplete={storiesIncomplete}
        />
      </li>
    );
  };
  // Stories first (F1): the header, then stops 1–3, then the tools and the rest.
  const FIRST = 3;
  const firstStops = tour.stops.slice(0, FIRST);
  const laterStops = tour.stops.slice(FIRST);

  return (
    <div className="space-y-4">
      <TourHeader cemetery={data.cemetery} people={data.people.length}>
        {hub.notHereHref && (
          <Link href={hub.notHereHref} className="tap inline-flex items-center text-mauve underline underline-offset-4">
            Not here? See the others
          </Link>
        )}
      </TourHeader>

      {hub.continueTo && (
        <Link href={hub.continueTo.href} onClick={forgetNext} className="btn btn-primary w-full" data-testid="continue-to">
          {hub.continueTo.label}
        </Link>
      )}

      <EtiquetteNotice />

      {deviceCopyAt && (
        <p role="status" className="rounded-xl border border-border bg-surface-2 px-4 py-2">
          {online ? "Couldn't load this tour live, so this" : "You're offline. This"} is the copy saved on this phone on {formatDay(deviceCopyAt)}.
        </p>
      )}
      {!deviceCopyAt && data.warnings.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm">
          {data.warnings.map((w) => (
            <p key={w.message}>{w.message}</p>
          ))}
        </div>
      )}

      <section aria-labelledby="stops-title" className="space-y-4">
        <h2 id="stops-title" className="sr-only">
          Tour stops
        </h2>
        <div role="group" aria-label="Tour order" className="flex flex-wrap gap-2">
          {visibleModes.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={tour.mode === m.id}
              onClick={() => setMode(m.id)}
              className={`tap rounded-full border px-4 text-sm font-bold ${
                tour.mode === m.id ? "border-accent bg-accent text-accent-ink" : "border-border"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {tour.mode === "route" && tour.routeLengthM !== undefined && (
          <p className="text-sm">
            {located.size} located graves, about {tour.routeLengthM < 1000 ? `${Math.round(tour.routeLengthM / 10) * 10} m` : `${(tour.routeLengthM / 1000).toFixed(1)} km`} of
            walking{first ? " from where you started" : ""}.
          </p>
        )}

        {data.people.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-3">
            Wikidata doesn&rsquo;t list anyone buried here yet, so there&rsquo;s no tour. Try another cemetery nearby.
          </p>
        ) : (
          <ol className="space-y-4" data-testid="tour-stops">
            {firstStops.map((s, i) => card(s, i))}
          </ol>
        )}

        {/* Then everything else: walk and save in one row, the tools, the rest of the stops. */}
        <section aria-label="Walking and saving" className="space-y-2">
          <div className="flex flex-wrap gap-2 [&>*]:min-w-[10rem] [&>*]:flex-1">
            {walking ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-2">
                <p className="flex-1 text-sm">
                  {position ? `Following your location (±${Math.round(position.accuracy)} m).` : "Finding your location…"}{" "}
                  {wakeLockHeld && "The screen stays on while this tour is open."}
                </p>
                <button type="button" onClick={() => setWalking(false)} className="tap rounded-lg border border-border px-3 text-sm">
                  Stop following
                </button>
              </div>
            ) : (
              <button type="button" onClick={startWalk} className="tap flex flex-col items-center justify-center rounded-xl border border-border px-4 py-1 font-bold">
                Start the walk
                <span className="text-sm font-normal">uses your location</span>
              </button>
            )}
            <DownloadTourButton data={data} />
          </div>
          {positionError && (
            <p role="alert" className="text-sm text-danger">
              {positionError}
            </p>
          )}
          {!routeOk && (
            <p className="text-sm text-muted" data-testid="route-hint">
              Best walking route appears once {MIN_ROUTE_STOPS} graves have a known location ({located3} of {MIN_ROUTE_STOPS} so far). Tap &ldquo;I
              found it&rdquo; at a grave to pin it.
            </p>
          )}
        </section>

        <HauntToolkit cemetery={data.cemetery} eligible={eligible} hub={hub} />

        {laterStops.length > 0 && (
          <ol className="space-y-4" start={FIRST + 1} aria-label="More stops">
            {laterStops.map((s, i) => card(s, i + FIRST))}
          </ol>
        )}

        {tour.remaining > 0 && (
          <button type="button" onClick={() => setCount((c) => c + PAGE_SIZE)} className="tap w-full rounded-xl border border-border px-4 font-bold">
            Show {Math.min(PAGE_SIZE, tour.remaining)} more stops ({tour.remaining} left)
          </button>
        )}
      </section>

      <TourLinks cemetery={data.cemetery} />
    </div>
  );
}
