import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { TourView } from "@/components/tour/TourView";
import { isSlowFailure, parsePeopleParam } from "@/lib/data/big";
import { loadTour } from "@/lib/data/load";
import { parseQid } from "@/lib/data/validate";
import { LOADING_INTRO } from "@/lib/tour/loading";
import { LoadingNote } from "./LoadingNote";
import { SlowCemetery } from "./SlowCemetery";

// The shared layout's BottomNav reads usePathname() outside <Suspense>, which a
// dynamic [qid] segment can't prerender. Until the layout wraps it in
// <Suspense>, this route opts out of static-shell validation (it renders per
// request anyway; the tour still streams behind its own Suspense fallback).
export const instant = false;

export const metadata: Metadata = {
  title: "Cemetery tour",
  description: "The graves worth visiting here, with how those people lived.",
};

export default function CemeteryPage({ params, searchParams }: PageProps<"/cemetery/[qid]">) {
  return (
    <>
      {/* Story photos come from Commons: Special:FilePath redirects to the scaled copy on
          thumb.wikimedia.org. Stop 1 is on the first screen (F1), so open both connections early
          (React hoists these links into the head of the HTML). */}
      <link rel="preconnect" href="https://commons.wikimedia.org" />
      <link rel="preconnect" href="https://thumb.wikimedia.org" />
      <ServiceWorkerRegistrar />
      <Suspense fallback={<TourLoading people={null} />}>
        <SizedTour params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/**
 * The static shell can't read the link, so it shows the loading screen without
 * a size; a moment later this swaps in the same screen with the size from `n`
 * (how many people the near list said are listed here) while the tour loads.
 */
async function SizedTour({ params, searchParams }: Pick<PageProps<"/cemetery/[qid]">, "params" | "searchParams">) {
  const people = parsePeopleParam((await searchParams).n);
  return (
    <Suspense fallback={<TourLoading people={people} />}>
      <Tour params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function TourLoading({ people }: { people: number | null }) {
  return (
    <div role="status" className="space-y-3" data-testid="tour-loading">
      <p className="font-display text-4xl leading-tight">Gathering the stories…</p>
      <p className="text-muted">{LOADING_INTRO}</p>
      {/* A big cemetery nobody has opened yet can take half a minute: say so once the wait is long. */}
      <LoadingNote people={people} />
    </div>
  );
}

async function Tour({ params, searchParams }: Pick<PageProps<"/cemetery/[qid]">, "params" | "searchParams">) {
  const { qid: raw } = await params;
  const parsed = parseQid(raw);
  // A link that can't lead to a tour (a malformed ID, an item Wikidata doesn't have, or one that
  // isn't a cemetery once the facts query says so) is the app's not-found page. The static shell has
  // already gone out, so the status stays 200 and Next adds robots noindex (decision 24 for /s/ links).
  if (!parsed.ok) notFound();
  // Always render at request time: the data is cached separately, and a
  // failed load must never be stored as the page.
  await connection();
  // Cold, this comes back once the first 20 stories are in; the rest stream in behind (`more`).
  const result = await loadTour(parsed.qid);

  if (result.status === "not-found") notFound();
  // Keys: a refresh after the slow-cemetery retry swaps the failed view for a fresh live one.
  if (result.status === "error") {
    // A Wikidata timeout (a big cemetery, N1) retries once from the browser before failing; an outage doesn't (Gate 8).
    const slow = isSlowFailure(result.error.source, result.error.kind);
    const people = slow ? parsePeopleParam((await searchParams).n) : null;
    return (
      <TourView
        key="failed"
        qid={parsed.qid}
        initial={null}
        error={{ source: result.error.source, message: result.error.userMessage }}
        fallback={slow ? <SlowCemetery qid={parsed.qid} people={people} /> : undefined}
      />
    );
  }
  if (result.status === "partial") {
    return <TourView key="live" qid={parsed.qid} initial={result.data} error={null} more={{ pending: result.pending, stories: result.more }} />;
  }
  return <TourView key="live" qid={parsed.qid} initial={result.data} error={null} />;
}
