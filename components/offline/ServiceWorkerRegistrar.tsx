"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production builds. Renders nothing. Mount once in the
 * root layout; the tour, near and search pages also mount it so a visitor who
 * opens a tour gets offline support even before the layout does.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // No service worker (private mode, old browser): pages still work online,
      // and downloaded tours still open from IndexedDB on /cemetery/saved.
    });
  }, []);
  return null;
}
