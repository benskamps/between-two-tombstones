// The moon's phase for the almanac ornament (MoonPhases in components/ui/Motifs.tsx): which of eight
// phases a date falls in, and the lit part of each phase as an SVG path.

import type { YMD } from "@/lib/stonemath";

/** Which of eight moon phases a local date falls in (0 new … 4 full), from a known new moon (6 Jan 2000, 18:14 UTC). */
export function moonPhaseIndex(date: YMD): number {
  const SYNODIC = 29.530588853;
  const days = (Date.UTC(date.y, date.m - 1, date.d, 12) - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  return Math.round((age / SYNODIC) * 8) % 8;
}

/** The lit part of phase i of 8 as a path, for a moon of radius r at (cx, cy). */
export function litPath(i: number, cx: number, cy: number, r: number): string | null {
  if (i === 0) return null;
  if (i === 4) return `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}Z`;
  const k = Math.cos((i / 8) * 2 * Math.PI);
  const rx = Math.abs(k) * r;
  const waxing = i < 4;
  const crescent = k > 0;
  const outer = waxing ? 1 : 0;
  const inner = waxing === crescent ? 0 : 1;
  return `M${cx} ${cy - r}A${r} ${r} 0 0 ${outer} ${cx} ${cy + r}A${rx.toFixed(2)} ${r} 0 0 ${inner} ${cx} ${cy - r}Z`;
}
