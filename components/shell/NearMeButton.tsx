"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ERRORS: Record<number, string> = {
  1: "Location is turned off for this site. Allow it in your browser settings, or search by name below.",
  2: "Your phone couldn't find its location. Try again outside, or search by name below.",
  3: "Finding your location took too long. Try again, or search by name below.",
};

/** Asks for location only when tapped, then opens the nearby list. */
export function NearMeButton() {
  const router = useRouter();
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
        className="tap w-full rounded-xl bg-accent px-5 py-3 text-lg font-bold text-accent-ink disabled:opacity-70"
      >
        {busy ? "Finding you…" : "Find cemeteries near me"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
