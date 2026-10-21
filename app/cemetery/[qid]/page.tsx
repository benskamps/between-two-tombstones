import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { TourView } from "@/components/tour/TourView";
import { PageHeader } from "@/components/ui/Motifs";
import { Sprout } from "@/components/ui/symbols";
import { isSlowFailure, parsePeopleParam } from "@/lib/data/big";
import { loadCemetery } from "@/lib/data/load";
import { parseQid } from "@/lib/data/validate";
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
      <Suspense fallback={<TourLoading />}>
        <Tour params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function TourLoading() {
  return (
    <div role="status" className="space-y-3">
      <p className="font-display text-4xl leading-tight">Gathering the stories…</p>
      <p className="text-muted">Asking Wikidata who&rsquo;s buried here and Wikipedia how they lived. This takes a few seconds the first time.</p>
    </div>
  );
}

async function Tour({ params, searchParams }: Pick<PageProps<"/cemetery/[qid]">, "params" | "searchParams">) {
  const { qid: raw } = await params;
  const parsed = parseQid(raw);
  if (!parsed.ok) {
    return (
      <div role="alert" className="space-y-5">
        <PageHeader title="That isn’t a cemetery we can look up" intro={parsed.message} tool="search" life={<Sprout className="h-5 w-5" />} />
        <Link href="/" className="btn btn-primary">
          Find a cemetery
        </Link>
      </div>
    );
  }
  // Always render at request time: the data is cached separately, and a
  // failed load must never be stored as the page.
  await connection();
  const result = await loadCemetery(parsed.qid);

  if (result.status === "not-found") {
    return (
      <div role="alert" className="space-y-5">
        <PageHeader
          title="No such place on Wikidata"
          intro={`Wikidata has no item ${result.qid}. Check the link, or find the cemetery by name.`}
          tool="search"
          life={<Sprout className="h-5 w-5" />}
        />
        <Link href="/" className="btn btn-primary">
          Find a cemetery
        </Link>
      </div>
    );
  }
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
  return <TourView key="live" qid={parsed.qid} initial={result.data} error={null} />;
}
