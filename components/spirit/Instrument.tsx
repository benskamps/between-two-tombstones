import type { CSSProperties, ReactNode } from "react";

/*
  The spirit box and the séance share one instrument (L10.4): a phosphor
  readout strip, a tuning dial whose needle steps with the band-pass filter,
  the spoken word large in the carved face, and the captions as a log inside
  the panel. Readouts repeat what the page already says in Atkinson, so they
  are hidden from assistive tech and never carry instructions.
*/

export type Readout = { label?: string; value: string };

/** A row of short Michroma readouts in wisp, with a status lamp. Decorative: the same facts are in the text. */
export function ReadoutStrip({ items, live }: { items: Readout[]; live: boolean }) {
  return (
    <div className="readout-strip scanlines" aria-hidden="true" data-testid="readouts">
      <span className="lamp" data-on={live ? "true" : "false"} />
      {items.map((r, i) => (
        <span key={i} className="readout">
          {r.label ? `${r.label} ` : ""}
          {r.value}
        </span>
      ))}
    </div>
  );
}

/**
 * The tuning dial. While running, the needle steps across in 12 steps of
 * `stepMs` (the band-pass interval), there and back: CSS only, no timers.
 */
export function SweepDial({ running, stepMs }: { running: boolean; stepMs: number }) {
  const style = { "--step": `${Math.max(20, Math.round(stepMs))}ms` } as CSSProperties;
  return (
    <div className="dial scanlines" data-running={running ? "true" : "false"} style={style} aria-hidden="true" data-testid="dial">
      <span className="dial-needle" />
    </div>
  );
}

/** The latest voice, big, in the carved face with a faint glow: the part people film. */
export function SpokenWord({ children, testId, digits = false }: { children: ReactNode; testId: string; digits?: boolean }) {
  return (
    <p
      aria-hidden="true"
      className={`ecto min-h-[3.5rem] text-center leading-tight text-text ${
        // Digits (a countdown) stay in Atkinson: IM Fell's old-style figures misread (F9).
        digits ? "font-sans text-3xl font-bold" : "font-display text-4xl"
      }`}
      data-testid={testId}
    >
      {children}
    </p>
  );
}

/** "03/60": voices so far against the cap. */
export function countOf(n: number, max: number): string {
  const width = String(max).length;
  return `${String(n).padStart(width, "0")}/${max}`;
}
