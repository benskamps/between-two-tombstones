import Link from "next/link";
import { HauntBadge } from "@/components/haunt/HauntBadge";
import { RingedMoon } from "@/components/ui/symbols";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-3">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-1">
        {/* One line, always: the wordmark never wraps and keeps one size (globals.css .wordmark); the haunt's
            name truncates instead (REVIEW-2 N3, REVIEW-3 #3). */}
        <Link href="/" className="tap flex min-w-0 shrink-0 items-center gap-2" aria-label="Between Two Tombstones, home">
          <RingedMoon className="h-6 w-6 shrink-0 text-mauve" />
          <span className="wordmark whitespace-nowrap font-display leading-tight">Between Two Tombstones</span>
        </Link>
        <HauntBadge />
      </div>
    </header>
  );
}
