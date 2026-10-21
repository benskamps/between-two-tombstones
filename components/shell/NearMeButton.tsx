"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

const ERRORS: Record<number, string> = {
  1: "Location is turned off for this site. Allow it in your browser settings, or search by name below.",
  2: "Your phone couldn't find its location. Try again outside, or search by name below.",
  3: "Finding your location took too long. Try again, or search by name below.",
};

/**
 * Asks for location only when tapped (never on load), then opens the nearby
 * list. Every failure says so and points at the name search below it.
 */
export function NearMeButton({ label = "Find cemeteries near me", hint }: { label?: string; hint?: string }) {
  const router = useRouter();
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setError("This browser can't share a location. Search by name below.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(5);
        const lon = pos.coords.longitude.toFixed(5);
        router.push(`/near?lat=${lat}&lon=${lon}`);
      },
      (err) => {
        setBusy(false);
        setError(ERRORS[err.code] ?? "Couldn't get your location. Search by name below.");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        aria-describedby={hint ? hintId : undefined}
        className="btn btn-primary btn-lg w-full"
      >
        {busy ? "Finding you…" : label}
      </button>
      {hint && (
        <p id={hintId} className="mt-1.5 text-center text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
