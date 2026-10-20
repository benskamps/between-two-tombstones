import type { Metadata } from "next";
import Link from "next/link";
import { SavedList } from "@/components/gravitator/SavedList";

export const metadata: Metadata = {
  title: "Your graveyards",
  description: "The cemeteries you saved in the Gravitator, kept on this phone.",
};

export default function SavedPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight">Your graveyards</h1>
        <p className="text-(--g-muted)">
          Saved on this phone only. Check a cemetery&rsquo;s hours before you go; many lock their gates at dusk.
        </p>
        <Link href="/gravitator" className="tap inline-flex items-center">
          Back to the deck
        </Link>
      </header>
      <SavedList />
    </div>
  );
}
