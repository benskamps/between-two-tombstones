import type { Metadata } from "next";
import { Suspense } from "react";
import { CalendarSubscribe, CalendarSubscribeFallback } from "@/components/calendar/CalendarSubscribe";
import { HauntGate } from "@/components/haunt/HauntGate";
import { CALENDAR_SAMPLES } from "@/lib/calendar/samples";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Haunted Calendar",
  description:
    "Subscribe to a cemetery and your calendar gets the death-days of people buried there, every year, each linking to their story.",
};

const KNOWN = CALENDAR_SAMPLES.map(({ qid, name, place }) => ({ qid, name, place }));

export default function CalendarPage() {
  // Subscriptions only work from the public address: preview deployments sit
  // behind a login that calendar apps can't do.
  const productionHost = new URL(SITE.url).host;
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Haunted Calendar</h1>
        <p className="text-muted">
          Subscribe to a cemetery and your calendar fills with the death-days of people buried there, every year.
          Each event links back to their story.
        </p>
      </header>
      {/* The picker reads ?cemetery= and the preview uses today's date: both only known in the browser. */}
      <Suspense fallback={<CalendarSubscribeFallback />}>
        {/* A calendar link (?cemetery=…) always opens; otherwise this needs a haunt. */}
        <HauntGate tool="/calendar" known={KNOWN}>
          <CalendarSubscribe samples={CALENDAR_SAMPLES} productionHost={productionHost} />
        </HauntGate>
      </Suspense>
    </div>
  );
}
