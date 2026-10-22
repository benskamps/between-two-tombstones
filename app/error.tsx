"use client"; // Error boundaries must be Client Components.

// An unexpected error in any page: the app's own skin and plain next steps
// instead of Next's default page (red team P2-15). Errors from data sources
// never land here; pages name those themselves (components/tour/SourceFailure).
// Root-layout errors go to app/global-error.tsx, which renders this inside its
// own <html>.

import Link from "next/link";
import { useEffect } from "react";
import { PageHeader } from "@/components/ui/Motifs";
import { Sprout } from "@/components/ui/symbols";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Server errors reach the browser as a generic message plus a digest that matches the server log.
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="This page didn’t load"
        intro="Something went wrong on our side while putting this page together."
        tool="haunt"
        life={<Sprout className="h-5 w-5" />}
      />
      <section
        role="alert"
        aria-labelledby="error-next"
        className="card card-alert space-y-4 p-4"
        data-testid="app-error"
        // The service worker never caches a page that shows a failure.
        data-btt-nocache=""
      >
        <h2 id="error-next" className="font-display text-2xl">
          What you can do
        </h2>
        <p>
          Try loading it again. If it still fails, start over from home, or open a tour you saved on this phone; saved tours
          open without a signal.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className="btn btn-ghost">
            Go home
          </Link>
          <Link href="/cemetery/saved" className="btn btn-ghost">
            Open saved tours
          </Link>
        </div>
        {digest && <p className="text-sm text-muted">If you report this, mention error {digest}.</p>}
      </section>
    </div>
  );
}
