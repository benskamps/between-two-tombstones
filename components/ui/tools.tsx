import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  Candle,
  Chisel,
  Comet,
  EpitaphRiddle,
  Fern,
  Gate,
  HourglassSprout,
  Key,
  Lily,
  Moth,
  PassportSeal,
  Planchette,
  Poppy,
  RingedMoon,
  Waveform,
  type SymbolProps,
} from "./symbols";

/*
  One tool, one sign (REVIEW-3 #1). Wherever a symbol stands for a tool (the
  bottom nav, the hub's toolkit, the games hub, the first sign of a page
  title's pair) it comes from this map, and it means that tool and nothing
  else. The ringed moon is the brand and the haunt. The second sign of a pair
  is a life sign (lily, sprout, candle) and only decorates.
*/

export type ToolId =
  | "haunt"
  | "search"
  | "gravitator"
  | "saved"
  | "stamp"
  | "spirit"
  | "seance"
  | "games"
  | "bingo"
  | "party"
  | "evp"
  | "stonemath"
  | "whoami"
  | "passport"
  | "calendar";

export const TOOL_ICON: Record<ToolId, ComponentType<SymbolProps>> = {
  haunt: RingedMoon, // and the logo
  search: Gate, // the way in: home's search, /near, /search, not-found
  gravitator: Moth, // a moth to a flame
  saved: Lily, // graves you kept
  stamp: Fern,
  spirit: Planchette,
  seance: Candle,
  games: Comet,
  bingo: HourglassSprout,
  party: Key,
  evp: Waveform,
  stonemath: Chisel,
  whoami: EpitaphRiddle,
  passport: PassportSeal,
  calendar: Poppy,
};

/** A tool's sign. Decorative (aria-hidden), in currentColor. */
export function ToolIcon({ tool, ...props }: SymbolProps & { tool: ToolId }) {
  const Icon = TOOL_ICON[tool];
  return <Icon {...props} />;
}

/**
 * A tool as a tile: its sign in a medallion, its name, and (as a row) one line
 * about it. `chip` packs four to a row (the hub's toolkit); `row` is a card
 * (the games hub). The link's name is the text; the medallion is decoration.
 */
export function ToolTile({
  tool,
  href,
  title,
  body,
  variant = "row",
}: {
  tool: ToolId;
  href: string;
  title: string;
  body?: ReactNode;
  variant?: "row" | "chip";
}) {
  if (variant === "chip") {
    return (
      <Link href={href} className="tool-chip tap">
        <span aria-hidden="true" className="tool-medallion tool-medallion-sm">
          <ToolIcon tool={tool} />
        </span>
        {title}
      </Link>
    );
  }
  return (
    <Link href={href} className="card tap flex items-center gap-4 p-4">
      <span aria-hidden="true" className="tool-medallion">
        <ToolIcon tool={tool} />
      </span>
      <span>
        <span className="font-display text-xl">{title}</span>
        {body && <span className="block text-muted">{body}</span>}
      </span>
    </Link>
  );
}
