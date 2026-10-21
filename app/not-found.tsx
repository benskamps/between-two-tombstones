import type { Metadata } from "next";
import Link from "next/link";
import { HauntReturn } from "@/components/haunt/HauntReturn";
import { MoonPhases, PageHeader } from "@/components/ui/Motifs";
import { Sprout } from "@/components/ui/symbols";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Unknown addresses and notFound(): the app's own page instead of Next's
 * default, which follows the phone's light/dark setting and turned white on a
 * light-mode phone (decision 18: dark only).
 */
export default function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Page not found"
        intro="There’s no page at this address. The link may be old or mistyped."
        tool="search"
        life={<Sprout className="h-5 w-5" />}
      />
      <section aria-labelledby="nf-next" className="card card-rule space-y-4 px-4 pb-4 pt-5">
        {/* A new moon: nothing here tonight. */}
        <MoonPhases tonight={0} />
        <h2 id="nf-next" className="text-center font-display text-2xl">
          Start from a cemetery
        </h2>
        <p>Let the app find the cemetery you&rsquo;re standing in, or look one up by name.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="btn btn-primary">
            Find a cemetery
          </Link>
          <Link href="/search" className="btn btn-ghost">
            Search by name
          </Link>
        </div>
      </section>
      <HauntReturn when="fresh" />
    </div>
  );
}
