"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { fetchDeck, OFFLINE_MESSAGE, type DeckResult } from "@/lib/gravitator/client";
import { getSaved, getSavedServer, subscribeSaved } from "@/lib/gravitator/saved";
import type { Deck } from "@/lib/gravitator/types";
import { PlaceholderArt } from "./PlaceholderArt";
import { SwipeDeck } from "./SwipeDeck";

export const SAMPLE_PLACES = [
  { label: "Atlanta", button: "Try it around Atlanta", lat: 33.7486, lon: -84.3733 },
  { label: "Sleepy Hollow, NY", button: "Try it around Sleepy Hollow, NY", lat: 41.0956, lon: -73.8607 },
] as const;

const GEO_ERRORS: Record<number, string> = {
  1: "Location is turned off for this site. Allow it in your browser settings, or try one of the places below.",
  2: "Your phone couldn't find its location. Try again outside, or try one of the places below.",
  3: "Finding your location took too long. Try again, or try one of the places below.",
};

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

function useSaved() {
  return useSyncExternalStore(subscribeSaved, getSaved, getSavedServer);
}

function coord(v: string | null, max: number): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

function deckHref(lat: number, lon: number, opts: { near?: string; r?: number } = {}): string {
  const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
  if (opts.near) q.set("near", opts.near);
  if (opts.r && opts.r !== 25) q.set("r", String(opts.r));
  return `/gravitator?${q}`;
}

function SavedLink() {
  const saved = useSaved();
  const n = saved?.length ?? 0;
  return (
    <Link href="/gravitator/saved" className="g-btn g-btn-ghost px-4 text-sm">
      Your graveyards{n > 0 ? ` (${n})` : ""}
    </Link>
  );
}

function TopBar() {
  return (
    // The title sits where every page's does (y = 73, REVIEW-3 #6): top-aligned, the pill beside it.
    <div className="mb-3 flex items-start justify-between gap-3">
      <h1 className="font-display text-4xl leading-tight">Gravitator</h1>
      <SavedLink />
    </div>
  );
}

// ---------------------------------------------------------------------------

function StartScreen() {
  const router = useRouter();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setError("This browser can't share a location. Try one of the places below.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Three decimals (about 100 m) is plenty for distances; the server only ever sees two.
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lon = Math.round(pos.coords.longitude * 1000) / 1000;
        router.push(deckHref(lat, lon));
      },
      (err) => {
        setBusy(false);
        setError(GEO_ERRORS[err.code] ?? "Couldn't get your location. Try one of the places below.");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }

  return (
    <div className="space-y-6">
      <TopBar />
      <div className="overflow-hidden rounded-3xl border border-(--g-border) bg-(--g-surface)">
        <div className="relative aspect-[4/3]">
          <PlaceholderArt qid="Q39614" className="absolute inset-0 h-full w-full" />
        </div>
        <div className="space-y-2 p-5">
          <p className="font-display text-3xl leading-tight">Graveyards near you, one profile at a time.</p>
          <p className="text-(--g-muted)">
            Swipe right to save a cemetery, left to pass, or tap Go now to start its tour. Every profile is a public
            cemetery. They don&rsquo;t swipe back.
          </p>
        </div>
      </div>

      {!online && (
        <p role="alert" className="rounded-2xl bg-(--g-surface-2) p-4">
          {OFFLINE_MESSAGE}
        </p>
      )}

      <div className="space-y-3">
        <button type="button" onClick={locate} disabled={busy} className="g-btn g-btn-mauve w-full text-lg">
          {busy ? "Finding you…" : "Use my location"}
        </button>
        {error && (
          <p role="alert" className="rounded-2xl bg-(--g-surface-2) p-4">
            {error}
          </p>
        )}
        <p className="pt-2 text-sm text-(--g-muted)">Or try it somewhere with famous residents:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SAMPLE_PLACES.map((p) => (
            <Link key={p.label} href={deckHref(p.lat, p.lon, { near: p.label })} className="g-btn g-btn-ghost w-full">
              {p.button}
            </Link>
          ))}
        </div>
      </div>

      <p className="text-sm text-(--g-muted)">
        We ask for your location only when you tap, and the server only sees it rounded to about a kilometer. Profiles
        come from Wikidata: public cemeteries only. Family, private, pet and abandoned cemeteries are left out.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LoadingCard({ radiusKm }: { radiusKm: number }) {
  return (
    <div className="g-stack" aria-busy="true">
      <div className="g-card">
        <div className="g-photo">
          <PlaceholderArt qid="Q4" />
        </div>
        <div className="g-body space-y-2">
          <p role="status" className="font-display text-2xl">
            Asking Wikidata who&rsquo;s out there…
          </p>
          <p className="text-(--g-muted)">Public cemeteries within {radiusKm} km. This can take a few seconds.</p>
        </div>
      </div>
    </div>
  );
}

function EndOfDeck({
  deck,
  skippedSaved,
  onWiden,
}: {
  deck: Deck;
  skippedSaved: number;
  onWiden: (() => void) | null;
}) {
  const capped = deck.total > deck.cards.length;
  const headline =
    deck.total === 0
      ? `No public cemeteries with a Wikidata entry within ${deck.radiusKm} km.`
      : capped
        ? `That's ${deck.cards.length} of the ${deck.total.toLocaleString("en-US")} public cemeteries with a Wikidata entry within ${deck.radiusKm} km: the most notable burials first, then the nearest.`
        : `That's every public cemetery with a Wikidata entry within ${deck.radiusKm} km.`;
  return (
    <section
      aria-labelledby="g-end-title"
      className="w-full space-y-4 rounded-3xl border border-(--g-border) bg-(--g-surface) p-6"
    >
      <h2 id="g-end-title" className="font-display text-2xl leading-snug">
        {headline}
      </h2>
      {skippedSaved > 0 && (
        <p className="text-(--g-muted)">
          {skippedSaved} you&rsquo;d already saved {skippedSaved === 1 ? "is" : "are"} in Your graveyards.
        </p>
      )}
      {deck.excluded > 0 && (
        <p className="text-sm text-(--g-muted)">
          Left out: {deck.excluded} family, private, pet or abandoned{" "}
          {deck.excluded === 1 ? "cemetery" : "cemeteries"}.
        </p>
      )}
      <div className="grid gap-3">
        {onWiden && (
          <button type="button" className="g-btn g-btn-mauve w-full" onClick={onWiden}>
            Look within 50 km
          </button>
        )}
        <Link href="/gravitator/saved" className="g-btn g-btn-ghost w-full">
          Your graveyards
        </Link>
        <Link href="/gravitator" className="g-btn g-btn-ghost w-full">
          Try another place
        </Link>
      </div>
    </section>
  );
}

function DeckLoader({ lat, lon, radiusKm, near }: { lat: number; lon: number; radiusKm: number; near: string | null }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    (DeckResult & { attempt: number }) | null
  >(null);
  const [ready, setReady] = useState<{ deck: Deck; cards: Deck["cards"]; skippedSaved: number } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchDeck(lat, lon, radiusKm, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        setResult({ ...r, attempt });
        if (r.ok) {
          // Cemeteries already saved on this phone don't come round again.
          const saved = new Set(getSaved().map((s) => s.qid));
          const cards = r.deck.cards.filter((c) => !saved.has(c.qid));
          setReady({ deck: r.deck, cards, skippedSaved: r.deck.cards.length - cards.length });
        }
      })
      .catch(() => {
        // Aborted: a newer request replaced this one.
      });
    return () => ac.abort();
  }, [lat, lon, radiusKm, attempt]);

  const where = near ? `Near ${near}` : "Near you";
  const loading = !result || result.attempt !== attempt;

  return (
    <div className="space-y-3">
      <TopBar />
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-sm text-(--g-muted)">
        <p>
          {where} · within {radiusKm} km
        </p>
        <Link href="/gravitator" className="tap inline-flex items-center">
          Change place
        </Link>
      </div>

      {loading && <LoadingCard radiusKm={radiusKm} />}

      {!loading && result && !result.ok && (
        <div role="alert" className="space-y-4 rounded-3xl border border-(--g-border) bg-(--g-surface) p-6">
          <h2 className="font-display text-2xl leading-snug">{result.message}</h2>
          <p className="text-(--g-muted)">Your saved graveyards still open while you wait.</p>
          <div className="grid gap-3">
            <button type="button" className="g-btn g-btn-mauve w-full" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
            <Link href="/gravitator/saved" className="g-btn g-btn-ghost w-full">
              Your graveyards
            </Link>
          </div>
        </div>
      )}

      {!loading && result?.ok && ready && (
        <>
          {ready.deck.notes.length > 0 && (
            <ul className="space-y-1 rounded-2xl bg-(--g-surface-2) p-3 text-sm" aria-label="What's missing">
              {ready.deck.notes.map((n) => (
                <li key={n.message}>{n.message}</li>
              ))}
            </ul>
          )}
          <SwipeDeck
            key={`${lat},${lon},${radiusKm}`}
            cards={ready.cards}
            origin={{ lat, lon }}
            renderEnd={() => (
              <EndOfDeck
                deck={ready.deck}
                skippedSaved={ready.skippedSaved}
                onWiden={radiusKm < 50 ? () => router.push(deckHref(lat, lon, { near: near ?? undefined, r: 50 })) : null}
              />
            )}
          />
        </>
      )}
    </div>
  );
}

/** Reads the place from the URL (?lat&lon&near&r): no place → the start screen. */
export function Gravitator() {
  const params = useSearchParams();
  const lat = coord(params.get("lat"), 90);
  const lon = coord(params.get("lon"), 180);
  const radiusKm = params.get("r") === "50" ? 50 : 25;
  const near = params.get("near")?.slice(0, 60) || null;
  if (lat === null || lon === null) return <StartScreen />;
  return <DeckLoader key={`${lat},${lon},${radiusKm}`} lat={lat} lon={lon} radiusKm={radiusKm} near={near} />;
}
