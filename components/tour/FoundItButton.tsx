"use client";

import { useState } from "react";
import { geoErrorMessage } from "@/components/offline/hooks";
import { removePin, savePin, type Pin } from "@/components/offline/store";
import { Sprout } from "@/components/ui/symbols";

/**
 * "I found it": takes the phone's position on tap and saves it as this grave's
 * pin in IndexedDB. Pins feed the walking route.
 */
export function FoundItButton({
  personQid,
  cemeteryQid,
  name,
  pin,
  onPinsChange,
}: {
  personQid: string;
  cemeteryQid: string;
  name: string;
  pin: Pin | undefined;
  onPinsChange: (pins: Record<string, Pin>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setError("This browser can't share a location, so graves can't be pinned.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const next = await savePin({
            personQid,
            cemeteryQid,
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            at: new Date().toISOString(),
          });
          onPinsChange(next);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save the pin on this phone.");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        setError(geoErrorMessage(err.code));
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );
  }

  async function unpin() {
    try {
      onPinsChange(await removePin(cemeteryQid, personQid));
    } catch {
      setError("Couldn't remove the pin.");
    }
  }

  if (pin) {
    return (
      // Finding a grave is the app's clearest life moment: lichen, with a sprout (REVIEW-3).
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="pinned">
        <span className="inline-flex items-center gap-1.5 text-sm text-lichen">
          <Sprout className="h-5 w-5 shrink-0" />
          <span>
            <span className="font-bold">Found.</span> Pinned here (±{pin.accuracy} m)
          </span>
        </span>
        <button type="button" onClick={unpin} className="btn btn-ghost px-4 text-sm">
          Remove pin<span className="sr-only"> for {name}</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        className="btn btn-ghost"
      >
        {busy ? "Getting your location…" : "I found it"}
        <span className="sr-only">: pin {name}&rsquo;s grave here</span>
      </button>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
