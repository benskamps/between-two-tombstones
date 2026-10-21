import type { ReactNode } from "react";
import { SymbolPair } from "@/components/ui/Motifs";

/**
 * The tool-page title: the carved h1 with a death/life pair beside it (so every
 * page's heading starts at the same height) and one Atkinson line under it.
 *
 * A stand-in with the same props and markup as lane10-skin-2's PageHeader in
 * components/ui/Motifs.tsx (03c3327, bf2528e). Once that merges, import it from
 * there and delete this file.
 */
export function PageHeader({
  title,
  intro,
  death,
  life,
}: {
  title: ReactNode;
  intro?: ReactNode;
  death: ReactNode;
  life: ReactNode;
}) {
  return (
    <header className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl leading-tight">{title}</h1>
        <SymbolPair death={death} life={life} className="shrink-0" />
      </div>
      {intro && <p className="text-muted">{intro}</p>}
    </header>
  );
}
