import Link from "next/link";
import type { DataSource } from "@/lib/data/errors";
import { SavedToursList } from "./SavedToursList";

const SAMPLES = [
  { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta, Georgia" },
  { qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow, New York" },
];

/**
 * A named failure with next steps. Never an empty "nothing here": says which
 * source failed, offers a retry, search, saved tours and the sample tours
 * (which have saved copies).
 */
export function SourceFailure({
  source,
  message,
  retryHref,
  showSearch = true,
}: {
  source: DataSource;
  message: string;
  retryHref: string;
  showSearch?: boolean;
}) {
  return (
    <section
      role="alert"
      aria-labelledby="failure-title"
      className="space-y-4 rounded-xl border border-danger bg-surface p-4"
      data-testid="source-failure"
      // The service worker never caches a page that shows a failure.
      data-btt-nocache=""
    >
      <h2 id="failure-title" className="font-display text-2xl">
        {source} didn&rsquo;t answer
      </h2>
      <p className="font-bold" data-testid="failure-message">
        {message}
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={retryHref} className="tap inline-flex items-center rounded-lg bg-accent px-4 font-bold text-accent-ink">
          Try again
        </a>
        {showSearch && (
          <Link href="/" className="tap inline-flex items-center rounded-lg border border-border px-4">
            Search by name
          </Link>
        )}
      </div>
      <SavedToursList />
      <div className="space-y-2">
        <h3 className="font-bold">Sample tours (saved copies, open even when {source} is down)</h3>
        <ul className="grid gap-2">
          {SAMPLES.map((s) => (
            <li key={s.qid}>
              <Link href={`/cemetery/${s.qid}`} className="tap block rounded-xl border border-border bg-surface-2 p-3">
                <span className="font-display text-lg">{s.name}</span>
                <span className="block text-sm text-muted">{s.place}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
