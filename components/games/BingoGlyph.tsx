import type { ComponentType, ReactNode } from "react";
import { Candle, Fern, Lily, Poppy, type SymbolProps } from "@/components/ui/symbols";
import { GLYPHS, type Shape } from "./bingoGlyphs";

const REUSED: Record<string, ComponentType<SymbolProps>> = { lily: Lily, poppy: Poppy, fern: Fern, rip: Candle };

function draw(s: Shape, key: number): ReactNode {
  if (typeof s === "string") return <path key={key} d={s} />;
  if ("t" in s)
    return (
      <g key={key} transform={s.t}>
        {s.s.map(draw)}
      </g>
    );
  if ("c" in s) {
    const [cx, cy, r] = s.c;
    return s.fill ? (
      <circle key={key} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
    ) : (
      <circle key={key} cx={cx} cy={cy} r={r} />
    );
  }
  if ("e" in s) {
    const [cx, cy, rx, ry] = s.e;
    return <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} />;
  }
  return <path key={key} d={s.d} fill="currentColor" stroke="none" />;
}

/** The carved symbol for a bingo square, in currentColor. Decorative: the square's label names it. */
export function BingoGlyph({ id, className, animate }: { id: string; className?: string; animate?: boolean }) {
  const Reused = REUSED[id];
  if (Reused) return <Reused className={className} animate={animate} />;
  const shapes = GLYPHS[id];
  if (!shapes) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {shapes.map(draw)}
    </svg>
  );
}
