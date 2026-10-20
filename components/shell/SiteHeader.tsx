import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-3">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
        <Link href="/" className="tap flex flex-col justify-center leading-tight">
          <span className="font-display text-xl">Between Two Tombstones</span>
          <span className="text-sm text-muted">Macy&rsquo;s Graveyard Companion</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
