import type { Metadata } from "next";
import { SavedTourPage } from "@/components/offline/SavedTourPage";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "Saved tours",
  description: "Tours downloaded on this phone, readable without a signal.",
};

/** Static offline shell; everything it shows comes from IndexedDB on the phone. */
export default function SavedPage() {
  return (
    <>
      <ServiceWorkerRegistrar />
      <SavedTourPage />
    </>
  );
}
