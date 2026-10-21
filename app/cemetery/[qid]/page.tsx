import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { TourView } from "@/components/tour/TourView";
import { loadCemetery } from "@/lib/data/load";
import { parseQid } from "@/lib/data/validate";

// The shared layout's BottomNav reads usePathname() outside <Suspense>, which a
// dynamic [qid] segment can't prerender. Until the layout wraps it in
// <Suspense>, this route opts out of static-shell validation (it renders per
// request anyway; the tour still streams behind its own Suspense fallback).
export const instant = false;

export const metadata: Metadata = {
  title: "Cemetery tour",
  description: "The graves worth visiting here, with how those people lived.",
};

export default function CemeteryPage({ params }: PageProps<"/cemetery/[qid]">) {
  return (
    <>
      {/* Story photos come from Commons: Special:FilePath redirects to the scaled copy on
          thumb.wikimedia.org. Stop 1 is on the first screen (F1), so open both connections early
          (React hoists these links into the head of the HTML). */}
      <link rel="preconnect" href="https://commons.wikimedia.org" />
      <link rel="preconnect" href="https://thumb.wikimedia.org" />
      <ServiceWorkerRegistrar />
      <Suspense fallback={<TourLoading />}>
        <Tour params={params} />
      </Suspense>
    </>
  );
}

function TourLoading() {
  return (
    <div role="status" className="space-y-3">
      <p className="font-display text-3xl">Gathering the stories…</p>
      <p className="text-muted">Asking Wikidata who&rsquo;s buried here and Wikipedia how they lived. This takes a few seconds the first time.</p>
    </div>
  );
}

async function Tour({ params }: Pick<PageProps<"/cemetery/[qid]">, "params">) {
  const { qid: raw } = await params;
  const parsed = parseQid(raw);
  if (!parsed.ok) {
    return (
      <div role="alert" className="space-y-3">
        <h1 className="font-display text-3xl">That isn&rsquo;t a cemetery we can look up</h1>
        <p>{parsed.message}</p>
        <Link href="/" className="tap inline-flex items-center underline">
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
      <div role="alert" className="space-y-3">
        <h1 className="font-display text-3xl">No such place on Wikidata</h1>
        <p>Wikidata has no item {result.qid}. Check the link, or find the cemetery by name.</p>
        <Link href="/" className="tap inline-flex items-center underline">
          Find a cemetery
        </Link>
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <TourView
        qid={parsed.qid}
        initial={null}
        error={{ source: result.error.source, message: result.error.userMessage }}
      />
    );
  }
  return <TourView qid={parsed.qid} initial={result.data} error={null} />;
}
