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
        <Link href="/" className="tap flex min-w-0 items-center gap-2">
          <RingedMoon className="h-6 w-6 shrink-0 text-mauve" />
          <span className="font-display text-xl leading-tight">Between Two Tombstones</span>
        </Link>
        <HauntBadge />
      </div>
    </header>
  );
}
