import type { CSSProperties, ReactNode } from "react";

/*
  Instrument primitives (the space-age half of the skin). First used by the
  spirit box and the séance; any tool can wear them:

    <section className="instrument bezel space-y-4 p-4">   the panel (globals.css)
      <ReadoutStrip status="Standby" values={[...]} live />  one line of phosphor readouts
      <SplitFlap value="KXMPRT" />                          a code, one cell per letter
      <SweepDial running stepMs={150} />                    a needle on a scale
      <SpokenWord key={id} testId="...">word</SpokenWord>   the big carved line
      ...controls (input.knob for ranges), a .ticker log...
    </section>

  Readouts repeat what the page already says in Atkinson, so they are hidden
  from assistive tech and never carry instructions.
*/

export type Readout = { label?: string; value: string };

/** At most this many values after the status, so a strip stays one line on a phone. */
export const MAX_READOUTS = 2;

/**
 * One line of short Michroma readouts with a status lamp (REVIEW-3 #7): the
 * lamp, the status word ("Standby", "Live", "Rec"…), then at most two values.
 * The same shape on every instrument; anything that doesn't fit is clipped,
 * never wrapped. Decorative: the same facts are in the text.
 *
 * `tone` is wisp on an .instrument (a live reading) and candle in the Stamp
 * Kit's darkroom. `testId` defaults to "readouts"; give each strip on a page its own.
 */
export function ReadoutStrip({
  status,
  values = [],
  live,
  tone = "wisp",
  testId = "readouts",
}: {
  status: string;
  values?: (Readout | null | false)[];
  live: boolean;
  tone?: "wisp" | "candle";
  testId?: string;
}) {
  const shown = values.filter((v): v is Readout => Boolean(v)).slice(0, MAX_READOUTS);
  return (
    <div className="readout-strip scanlines" data-tone={tone} aria-hidden="true" data-testid={testId}>
      <span className="lamp" data-on={live ? "true" : "false"} />
      <span className="readout readout-status">{status}</span>
      {shown.map((r, i) => (
        <span key={i} className="readout">
          {r.label ? `${r.label} ` : ""}
          {r.value}
        </span>
      ))}
    </div>
  );
}

/**
 * A split-flap readout, one cell per character: room codes for the party and
 * the séance. The text content is exactly `value`, so it reads and copies as
 * the code itself.
 */
export function SplitFlap({ value, small = false, testId }: { value: string; small?: boolean; testId?: string }) {
  return (
    <span className={`split-flap ${small ? "split-flap-sm" : ""}`} data-testid={testId}>
      {[...value].map((ch, i) => (
        <span key={i} className="split-flap-cell">
          {ch}
        </span>
      ))}
    </span>
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

/**
 * The big line in the carved face with a faint glow (the part people film).
 * Give it a `key` per word at the call site and each new word materializes.
 */
export function SpokenWord({ children, testId, digits = false }: { children: ReactNode; testId: string; digits?: boolean }) {
  return (
    <p
      aria-hidden="true"
      className={`ecto materialize min-h-[3.5rem] text-center leading-tight text-text ${
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
