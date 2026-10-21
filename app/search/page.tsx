import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ServiceWorkerRegistrar } from "@/components/offline/ServiceWorkerRegistrar";
import { CemeteryList } from "@/components/tour/CemeteryList";
import { SearchForm } from "@/components/tour/SearchForm";
import { SourceFailure } from "@/components/tour/SourceFailure";
import { PageHeader } from "@/components/ui/Motifs";
import { Sprout } from "@/components/ui/symbols";
import { asDataSourceError } from "@/lib/data/errors";
import { loadSearch } from "@/lib/data/load";
import type { CemeterySearchResult } from "@/lib/data/types";
import { parseQuery } from "@/lib/data/validate";

export const metadata: Metadata = {
  title: "Find a cemetery",
  description: "Search cemeteries on Wikidata by name.",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="space-y-5">
      <ServiceWorkerRegistrar />
      <PageHeader title="Find a cemetery" tool="search" life={<Sprout className="h-5 w-5" />} />
      <Suspense
        fallback={
          <>
            <SearchForm />
            <p role="status">Searching Wikidata…</p>
          </>
        }
      >
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchResults({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const sp = await searchParams;
  const raw = one(sp.q) ?? "";
  if (!raw.trim()) {
    return (
      <div className="space-y-3">
        <SearchForm />
        <p className="text-muted">Type the cemetery&rsquo;s name, like &ldquo;Oakland Cemetery&rdquo; or &ldquo;Lake View Cemetery&rdquo;.</p>
      </div>
    );
  }
  const parsed = parseQuery(raw);
  if (!parsed.ok) {
    return (
      <div className="space-y-3">
        <SearchForm defaultValue={raw.slice(0, 100)} />
        <p role="alert">{parsed.message}</p>
      </div>
    );
  }

  let results: CemeterySearchResult[];
  try {
    results = await loadSearch(parsed.q);
  } catch (e) {
    unstable_rethrow(e);
    const err = asDataSourceError(e, "Wikidata");
    return (
      <div className="space-y-4">
        <SearchForm defaultValue={parsed.q} />
        <SourceFailure source={err.source} message={err.userMessage} retryHref={`/search?q=${encodeURIComponent(parsed.q)}`} showSearch={false} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SearchForm defaultValue={parsed.q} />
      {results.length === 0 ? (
        <p data-testid="search-empty">
          No cemeteries on Wikidata match &ldquo;{parsed.q}&rdquo;. Check the spelling, or try the cemetery&rsquo;s full name, like &ldquo;Oakland
          Cemetery&rdquo;.
        </p>
      ) : (
        <>
          <p className="text-muted">
            {results.length} {results.length === 1 ? "cemetery" : "cemeteries"} on Wikidata. Same names are common, so check the town.
          </p>
          <CemeteryList items={results} label={`Cemeteries matching ${parsed.q}`} />
        </>
      )}
    </div>
  );
}
