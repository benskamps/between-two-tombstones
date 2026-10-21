"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useSyncExternalStore } from "react";

const ERRORS: Record<number, string> = {
  1: "Location is turned off for this site. Allow it in your browser settings, or search by name below.",
  2: "Your phone couldn't find its location. Try again outside, or search by name below.",
  3: "Finding your location took too long. Try again, or search by name below.",
};
const NO_GEO = "This browser can't share a location. Search by name below.";

type Early = { state: "pending" | "done" | "offline" | "error"; code?: number } | null;
type Status = { kind: "idle" } | { kind: "busy" } | { kind: "offline" } | { kind: "error"; message: string };

declare global {
  interface Window {
    __bttLocate?: Early;
  }
}

const noSubscribe = () => () => {};

function fromEarly(e: Early): Status {
  if (!e) return { kind: "idle" };
  if (e.state === "pending" || e.state === "done") return { kind: "busy" };
  if (e.state === "offline") return { kind: "offline" };
  return { kind: "error", message: e.code ? (ERRORS[e.code] ?? ERRORS[2]) : NO_GEO };
}

/** Where the nearby list lives, with how sure the phone is (F17: the data lane's contract). */
export function nearHref(pos: GeolocationPosition): string {
  const { latitude, longitude, accuracy } = pos.coords;
  return `/near?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}&acc=${Math.round(accuracy)}`;
}

/**
 * Asks for location only when tapped (never on load), then opens the nearby
 * list. A tap before React is ready is caught by the layout's early script
 * (data-locate); this picks up its state once mounted. Every failure says so
 * and points at the name search below it; with no signal, at the saved tours.
 */
export function NearMeButton({ label = "Find cemeteries near me", hint }: { label?: string; hint?: string }) {
  const router = useRouter();
  const hintId = useId();
  // false in the server HTML, true once React owns the button (then the early script steps aside).
  const ready = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // A tap that landed before hydration: show where it got to.
  useEffect(() => {
    const sync = () => setStatus(fromEarly(window.__bttLocate ?? null));
    if (window.__bttLocate) sync();
    window.addEventListener("btt-locate", sync);
    return () => window.removeEventListener("btt-locate", sync);
  }, []);

  function locate() {
    if (typeof navigator.onLine === "boolean" && !navigator.onLine) {
      setStatus({ kind: "offline" });
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", message: NO_GEO });
      return;
    }
    setStatus({ kind: "busy" });
    navigator.geolocation.getCurrentPosition(
      (pos) => router.push(nearHref(pos)),
      (err) => setStatus({ kind: "error", message: ERRORS[err.code] ?? "Couldn't get your location. Search by name below." }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  const busy = status.kind === "busy";
  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        data-locate=""
        data-ready={ready ? "" : undefined}
        aria-describedby={hint ? hintId : undefined}
        className="btn btn-primary btn-lg w-full"
      >
        {busy ? "Finding you…" : label}
      </button>
      {hint && (
        <p id={hintId} className="mt-1.5 text-center text-[0.9375rem] text-text">
          {hint}
        </p>
      )}
      {status.kind === "offline" && (
        <p role="alert" className="mt-2 text-danger">
          No signal. Your saved tours still open.{" "}
          <Link href="/cemetery/saved" className="tap inline-flex items-center font-bold text-mauve underline underline-offset-4">
            Open saved tours
          </Link>
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="mt-2 text-danger">
          {status.message}
        </p>
      )}
    </div>
  );
}
