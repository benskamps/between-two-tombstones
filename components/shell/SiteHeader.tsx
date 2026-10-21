import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-3">
        Skip to content
      </a>
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-1">
        <Link href="/" className="tap flex items-center">
          <span className="font-display text-xl leading-tight">Between Two Tombstones</span>
        </Link>
      </div>
    </header>
  );
}
