import type { ReactNode, SVGProps } from "react";

/*
  The symbol set: geometric line art on a 24-unit grid, one stroke width,
  drawn in currentColor. Decorative only (aria-hidden), no raster, cheap to
  render. Death signs and life signs are meant to be shown in pairs (see
  SymbolPair in Motifs.tsx): moon with a bloom, gate with a fern, moth with a
  candle, hourglass with its sprout.
*/

export type SymbolProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Slow CSS motion (orbit, flicker). Off under prefers-reduced-motion. */
  animate?: boolean;
};

function Svg({ children, className, ...props }: SymbolProps & { children: ReactNode }) {
  // `animate` is for the symbol itself, never an SVG attribute.
  const { animate, ...rest } = props;
  void animate;
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
      className={className ?? "h-6 w-6"}
      {...rest}
    >
      {children}
    </svg>
  );
}

/** A moon with an orbit ring: the ring's back half passes behind the moon. */
export function RingedMoon({ animate, ...props }: SymbolProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 6a3.6 6 0 0 0 0 12" opacity=".7" />
      <g className={animate ? "sym-orbit" : undefined}>
        <g transform="rotate(-18 12 12)">
          <path d="M1.5 12a10.5 3.2 0 0 0 21 0" />
          <path d="M1.5 12a10.5 3.2 0 0 1 4.5-2.63M18 9.37A10.5 3.2 0 0 1 22.5 12" />
          <circle cx="21.2" cy="13.2" r=".9" fill="currentColor" stroke="none" />
        </g>
      </g>
    </Svg>
  );
}

export function Moth(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M12 8.2v9.6" strokeWidth={2} />
      <path d="M11.4 10.2C8.8 5.6 3.6 5.2 3 8.6c-.5 3 3.6 4.6 8.4 3.6" />
      <path d="M12.6 10.2c2.6-4.6 7.8-5 8.4-1.6.5 3-3.6 4.6-8.4 3.6" />
      <path d="M11.4 13.2c-2.9.4-5 2.7-4 4.6.9 1.6 3 .2 4-2.2" />
      <path d="M12.6 13.2c2.9.4 5 2.7 4 4.6-.9 1.6-3 .2-4-2.2" />
      <circle cx="6.6" cy="9" r="1.1" />
      <circle cx="17.4" cy="9" r="1.1" />
      <path d="M11.6 8.2C11 6.4 9.9 5.1 8.6 4.4M12.4 8.2c.6-1.8 1.7-3.1 3-3.8" />
    </Svg>
  );
}

export function Lily(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M12 21.5V12" />
      <path d="M12 12C9.4 9.6 8.6 5.6 12 2.5c3.4 3.1 2.6 7.1 0 9.5Z" />
      <path d="M12 12C8.2 12.2 4.7 10.4 4 6.6c3.6-.2 6.6 1.8 8 5.4Z" />
      <path d="M12 12c3.8.2 7.3-1.6 8-5.4-3.6-.2-6.6 1.8-8 5.4Z" />
      <path d="M12 18.4c-2.8-.6-4.6-2.4-4.8-4.4 2.2.2 4.1 1.8 4.8 4.4Z" />
    </Svg>
  );
}

/** A fern frond: a stem with paired pinnae that shorten toward the tip. */
export function Fern(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M12 22V3" />
      <path d="M12 18.5 6.6 15.6M12 18.5l5.4-2.9M12 14.6 7.4 12.2M12 14.6l4.6-2.4M12 10.8 8.4 8.9M12 10.8l3.6-1.9M12 7.2 9.6 6M12 7.2 14.4 6" />
    </Svg>
  );
}

export function Poppy(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 8.5c0 5 2.6 7.6 5.5 7.6s5.5-2.6 5.5-7.6c-2 1.6-3.7-1-5.5.8-1.8-1.8-3.5.8-5.5-.8Z" />
      <path d="M12 9.3V12.6" />
      <circle cx="12" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 16.1c0 2.4-.6 4.2-1.8 5.9" />
      <path d="M11.2 19.2c-1.8-.2-3-1.2-3.4-2.6 1.6 0 2.8.9 3.4 2.6Z" />
    </Svg>
  );
}

/** An hourglass whose fallen sand has a sprout coming up out of it. */
export function HourglassSprout(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 2.75h13M5.5 21.25h13" />
      <path d="M7.5 2.75c0 5 4.5 7 4.5 9.25s-4.5 4.25-4.5 9.25M16.5 2.75c0 5-4.5 7-4.5 9.25s4.5 4.25 4.5 9.25" />
      <path d="M8.9 21.25c.8-1.4 5.4-1.4 6.2 0" />
      <path d="M12 19.9v-3.4" />
      <path d="M12 17.6c-1.3-.5-2-1.4-2-2.6 1.3.3 2 1.2 2 2.6ZM12 17c1.2-.6 1.9-1.5 1.8-2.6-1.2.4-1.8 1.3-1.8 2.6Z" />
    </Svg>
  );
}

/** A sprout with two leaves: something new coming up (a found square, a birthday). */
export function Sprout(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M12 21v-8.5" />
      <path d="M12 15c-3 0-5-1.8-5.5-4.8 3 0 5 1.8 5.5 4.8Z" />
      <path d="M12 12.5c3 0 5-1.8 5.5-4.8-3 0-5 1.8-5.5 4.8Z" />
    </Svg>
  );
}

export function Planchette(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.8c5 0 8.6 4.6 8.1 9.6-.4 4.1-3.8 7.4-8.1 8.8-4.3-1.4-7.7-4.7-8.1-8.8C3.4 7.4 7 2.8 12 2.8Z" />
      <circle cx="12" cy="9.6" r="2.7" />
      <path d="M12 6.9v-1M12 12.3v1M9.3 9.6h-1M14.7 9.6h1" opacity=".7" />
      <circle cx="8.2" cy="16.2" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="16.2" r=".8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function Candle({ animate, ...props }: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M9 10.5h6v10.5H9Z" />
      <path d="M9 12.6c.9 0 1 1.5 1.9 1.5V10.5" />
      <path d="M12 10.5V8.8" />
      <path d="M12 8.6c-1.6-1.3-1.4-3.6 0-5.6 1.4 2 1.6 4.3 0 5.6Z" className={animate ? "sym-flame" : undefined} />
      <path d="M6.5 21h11" />
    </Svg>
  );
}

export function Key(props: SymbolProps) {
  return (
    <Svg {...props}>
      <circle cx="6.8" cy="12" r="3.6" />
      <circle cx="6.8" cy="12" r="1.2" />
      <path d="M10.4 12H21.5M17.2 12v3.2M19.8 12v2.4" />
    </Svg>
  );
}

/** A wrought-iron gate with spear-topped bars under an arch. */
export function Gate(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M4 21.25V7.5M20 21.25V7.5M2.75 21.25h18.5" />
      <path d="M4 9c2.6-3 13.4-3 16 0" />
      <path d="M8.3 21.25V7.4M12 21.25V6.2M15.7 21.25V7.4" />
      <path d="M11 6.6 12 4.6l1 2" />
      <path d="M4 15h16" />
      <circle cx="4" cy="6.4" r=".9" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6.4" r=".9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function Comet(props: SymbolProps) {
  return (
    <Svg {...props}>
      <circle cx="16.4" cy="7.6" r="2.6" />
      <path d="M14.4 9.8 4 20.2M13.3 8.3 6.7 14.4M15.9 10.9 9.8 17.4" />
      <path d="M5.5 4.5v3M4 6h3" />
    </Svg>
  );
}

/** A sound trace: the EVP recorder. */
export function Waveform(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 12h3l1.5-4 2 9 2.5-12 2.5 14 2-9 1.5 4.5 1.2-2.5h3.3" />
    </Svg>
  );
}

/** A small four-point star, for readouts and list bullets. */
export function Star(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 13.3 10.7 20.5 12 13.3 13.3 12 20.5 10.7 13.3 3.5 12 10.7 10.7Z" />
    </Svg>
  );
}

/** Dividers over an inscribed tablet: the Stone Math calculator. */
export function Chisel(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5v7.5h14v-7.5" />
      <path d="M8 16h8M9.5 18.5h5" />
      <circle cx="12" cy="4.5" r="1.6" />
      <path d="M11 6 6.5 14M13 6l4.5 8" />
      <path d="M8.5 10.5h7" />
    </Svg>
  );
}

/** An arched headstone with a carved question cipher: Who Am I? */
export function EpitaphRiddle(props: SymbolProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 20.5V10a6.5 6.5 0 0 1 13 0v10.5M3.5 20.5h17" />
      <path d="M10.2 9.2a2 2 0 1 1 2.9 1.8c-.7.4-1.1.9-1.1 1.7v.5" />
      <circle cx="12" cy="16.2" r=".8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A pocket field ledger with an arched crest: the Graveyard Passport. */
export function PassportSeal(props: SymbolProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 3v18" />
      <path d="M11 11.5V9.8a2.5 2.5 0 0 1 5 0v1.7Z" />
      <path d="M10.5 14.5h6M11.5 17h4" />
    </Svg>
  );
}
