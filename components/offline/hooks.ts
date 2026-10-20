"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/** True while the page is on screen. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** navigator.onLine, live. Server render assumes online. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (t: "release", cb: () => void) => void };

/**
 * Keeps the screen on while `enabled` and the page is visible; releases it when
 * the page is hidden or the component unmounts. Returns whether it's held.
 */
export function useWakeLock(enabled: boolean): boolean {
  const visible = usePageVisible();
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!enabled || !visible || !wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    wl.request("screen")
      .then((s) => {
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
        setHeld(true);
        s.addEventListener("release", () => setHeld(false));
      })
      .catch(() => setHeld(false));
    return () => {
      cancelled = true;
      if (sentinel) void sentinel.release().catch(() => {});
      setHeld(false);
    };
  }, [enabled, visible]);

  return held;
}

export type Position = { lat: number; lon: number; accuracy: number; at: number };

/**
 * watchPosition only while `active` and the page is visible; cleared otherwise.
 * Never starts on its own: `active` comes from a tap.
 */
export function useWatchPosition(active: boolean): {
  position: Position | null;
  /** The first fix since the last reset(): where the walk started. */
  first: Position | null;
  error: string | null;
  reset: () => void;
} {
  const visible = usePageVisible();
  const [fixes, setFixes] = useState<{ first: Position | null; latest: Position | null }>({ first: null, latest: null });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !visible || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp };
        setFixes((s) => ({ first: s.first ?? p, latest: p }));
      },
      (err) => setError(geoErrorMessage(err.code)),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active, visible]);

  return {
    position: active ? fixes.latest : null,
    first: active ? fixes.first : null,
    error: active ? error : null,
    reset: () => setFixes({ first: null, latest: null }),
  };
}

export function geoErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "Location is turned off for this site. Allow it in your browser settings to pin graves.";
    case 2:
      return "Your phone couldn't find its location. Try again in the open, away from trees and buildings.";
    case 3:
      return "Finding your location took too long. Try again.";
    default:
      return "Couldn't get your location. Try again.";
  }
}
