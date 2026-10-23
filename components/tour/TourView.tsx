"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { preload } from "react-dom";
import Link from "next/link";
import { HauntToolkit } from "@/components/haunt/HauntToolkit";
import { MakeHauntOffer } from "@/components/haunt/MakeHauntOffer";
import { useHub } from "@/components/haunt/useHub";
import { DownloadTourButton } from "@/components/offline/DownloadTourButton";
import { useOnline, useWakeLock, useWatchPosition } from "@/components/offline/hooks";
import { getPins, getSavedTour, type Pin } from "@/components/offline/store";
import type { DataSource } from "@/lib/data/errors";
import type { BurialsResponse } from "@/lib/data/types";
import { countEligible } from "@/lib/haunt/eligibility";
import { forgetNext } from "@/lib/haunt/next";
import { EtiquetteNotice } from "@/components/shell/EtiquetteNotice";
import { ShareButton } from "@/components/share/ShareButton";
import { EmptyState } from "@/components/ui/Motifs";
import { Gate } from "@/components/ui/symbols";
import { buildStops, canRoute, locatedGraves, MIN_ROUTE_STOPS, MODES, PAGE_SIZE, type Mode } from "@/lib/tour/modes";
import { distanceM } from "@/lib/tour/route";
import { CARD_PHOTO_WIDTH, SMALL_PHOTO_WIDTH, commonsThumb } from "@/lib/tour/links";
import { cardPhoto } from "@/lib/tour/photo";
import { rankPeople } from "@/lib/tour/score";
import { sharePath } from "@/lib/share/links";
import { addStories, MORE_STORIES_LOST, MORE_STORIES_WAIT_MS, storiesIncomplete, type MoreStories } from "@/lib/tour/stories";
import type { TourWarning } from "@/lib/data/types";
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
  /**
   * Set when the server sent the first stories before the rest (a cold cache):
   * who is still waiting for a story, and the promise that brings them.
   */
  more?: { pending: string[]; stories: Promise<MoreStories> };
};

const NONE: ReadonlySet<string> = new Set();

function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "earlier" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function TourView({ qid, initial, error, fallback, more }: Props) {
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
  // Stories still on their way from the server, and what went wrong with them.
  const [waiting, setWaiting] = useState<ReadonlySet<string>>(() => (more && more.pending.length > 0 ? new Set(more.pending) : NONE));
  const [lateWarnings, setLateWarnings] = useState<TourWarning[]>([]);

  // The rest of the stories: merged in when they land. Capped: if they never arrive, say so and stop waiting.
  useEffect(() => {
    if (!more || more.pending.length === 0) return;
    let live = true;
    const cap = setTimeout(() => stop([MORE_STORIES_LOST]), MORE_STORIES_WAIT_MS);
    function stop(warnings: TourWarning[]) {
      if (!live) return;
      live = false;
      clearTimeout(cap);
      setLateWarnings(warnings);
      setWaiting(NONE);
    }
    more.stories.then(
      (r) => {
        if (!live) return;
        setData((d) => (d ? addStories(d, r) : d));
        stop(r.warnings);
      },
      () => stop([MORE_STORIES_LOST]),
    );
    return () => {
      live = false;
      clearTimeout(cap);
    };
  }, [more]);

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

  // A story still on its way ranks as if it were in, so the stops hold still when it lands.
  const ranked = useMemo(
    () => (data ? rankPeople(data.people, { now, cemeteryName: data.cemetery.name, storyPending: waiting }) : []),
    [data, now, waiting],
  );
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
  const incomplete = storiesIncomplete(data.warnings) || storiesIncomplete(lateWarnings);
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
          total={ranked.length}
          cemeteryQid={data.cemetery.qid}
          cemeteryName={data.cemetery.name}
          pin={pins[s.person.qid]}
          onPinsChange={setPins}
          distanceM={position && at ? distanceM(position, at) : null}
          now={now}
          storiesIncomplete={incomplete}
          storyPending={waiting.has(s.person.qid)}
        />
      </li>
    );
  };
  // Stories first (F1): the header, then stops 1–3, then the tools and the rest.
  const FIRST = 3;
  const firstStops = tour.stops.slice(0, FIRST);
  const laterStops = tour.stops.slice(FIRST);

  // Stop 1 is on the first screen now, and its photo is often the largest thing there (LCP).
  // The card's <img> is lazy; start fetching that one photo from the document head instead.
  const leadPhoto = firstStops[0] ? cardPhoto(firstStops[0].person, data.cemetery.name) : null;
  const leadThumb = leadPhoto ? commonsThumb(leadPhoto.src, leadPhoto.kind === "grave" ? CARD_PHOTO_WIDTH : SMALL_PHOTO_WIDTH) : null;
  if (leadThumb && online) preload(leadThumb, { as: "image", fetchPriority: "high", referrerPolicy: "no-referrer" });

  return (
    <div className="space-y-4">
      <TourHeader cemetery={data.cemetery} people={data.people.length}>
        {hub.notHereHref && (
          <Link href={hub.notHereHref} className="tap inline-flex items-center text-mauve underline underline-offset-4">
            Not here? See the others
          </Link>
        )}
      </TourHeader>

      {/* The header names a different haunt: offer the switch right here, not four screens down (REVIEW-2 N6). */}
      {hub.other && <MakeHauntOffer name={hub.other.name} onMake={hub.makeHaunt} />}

      {hub.continueTo && (
        <Link href={hub.continueTo.href} onClick={forgetNext} className="btn btn-primary w-full" data-testid="continue-to">
          {hub.continueTo.label}
        </Link>
      )}

      {deviceCopyAt && (
        <p role="status" className="rounded-xl border border-border bg-surface-2 px-4 py-2">
          {online ? "Couldn't load this tour live, so this" : "You're offline. This"} is the copy saved on this phone on {formatDay(deviceCopyAt)}.
        </p>
      )}
      {/* A saved copy reads the same as live: one quiet line, not a box above the first story. Missing stories keep the box. */}
      {!deviceCopyAt && data.warnings.length > 0 &&
        (data.warnings.every((w) => w.code === "saved-copy") ? (
          <p role="status" className="text-sm text-muted">
            {data.warnings.map((w) => w.message).join(" ")}
          </p>
        ) : (
          <div role="status" className="space-y-1 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm">
            {data.warnings.map((w) => (
              <p key={w.message}>{w.message}</p>
            ))}
          </div>
        ))}

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
          <EmptyState
            title="No tour here yet"
            sign={<Gate className="h-7 w-7" />}
            action={
              <Link href="/" className="btn btn-primary">
                Find another cemetery
              </Link>
            }
          >
            Wikidata doesn&rsquo;t list anyone buried here yet, so there&rsquo;s no tour. Try another cemetery nearby.
          </EmptyState>
        ) : (
          <ol className="space-y-4" data-testid="tour-stops">
            {firstStops.map((s, i) => card(s, i))}
          </ol>
        )}

        {/* The rules sit where the walk starts, after the first stories, not above them. */}
        <EtiquetteNotice />

        {/* Then everything else: walk and save in one row, the tools, the rest of the stops. */}
        <section aria-label="Walking and saving" className="space-y-2">
          <div className="flex flex-wrap gap-2 [&>*]:min-w-[10rem] [&>*]:flex-1">
            {walking ? (
              <div className="card flex flex-wrap items-center gap-3 px-4 py-2">
                <p className="flex-1 text-sm">
                  {position ? `Following your location (±${Math.round(position.accuracy)} m).` : "Finding your location…"}{" "}
                  {wakeLockHeld && "The screen stays on while this tour is open."}
                </p>
                <button type="button" onClick={() => setWalking(false)} className="btn btn-ghost px-4 text-sm">
                  Stop following
                </button>
              </div>
            ) : (
              <button type="button" onClick={startWalk} className="btn btn-ghost flex-col !gap-0 py-1">
                Start the walk
                <span className="text-sm font-normal text-muted">uses your location</span>
              </button>
            )}
            {waiting.size > 0 ? (
              // Saving now would keep a tour with stories missing: wait for them (a few seconds, capped above).
              <div>
                <button type="button" disabled className="btn btn-ghost w-full">
                  Download waits for the last stories
                </button>
              </div>
            ) : (
              <DownloadTourButton data={data} />
            )}
            {data.people.length > 0 && (
              <div>
                <ShareButton
                  kind="tour"
                  path={sharePath({ kind: "tour", cemetery: data.cemetery.qid })}
                  title={`A tour of ${data.cemetery.name}`}
                  text={`A tour of ${data.cemetery.name}: ${data.people.length} ${data.people.length === 1 ? "person" : "people"} listed.`}
                  label="Share this tour"
                  className="btn btn-ghost w-full"
                />
              </div>
            )}
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

        {/* Problems with the stories that came in after the first ones: said here, below the stops on
            screen, so nothing above them moves (CLS 0). */}
        {lateWarnings.length > 0 && (
          <div role="status" className="space-y-1 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm" data-testid="late-warnings">
            {lateWarnings.map((w) => (
              <p key={w.message}>{w.message}</p>
            ))}
          </div>
        )}

        {tour.remaining > 0 && (
          <button type="button" onClick={() => setCount((c) => c + PAGE_SIZE)} className="btn btn-ghost w-full">
            Show {Math.min(PAGE_SIZE, tour.remaining)} more stops ({tour.remaining} left)
          </button>
        )}
      </section>

      <TourLinks cemetery={data.cemetery} />
    </div>
  );
}
