import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { litPath } from "@/lib/moon";
import { RingedMoon } from "./symbols";

/*
  Shared forms for the gothic retro-futurist skin. All decoration is CSS (see
  app/globals.css: .arch, .card, .card-rule, .bezel, .instrument, .fence,
  .orbit-divider, .moon-phases, .step, .specimen) or inline SVG in
  currentColor, hidden from assistive tech.
*/

/** A wrought-iron fence line with spear finials. */
export function FenceDivider({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`fence ${className}`} />;
}

/** A hairline with a small ringed moon in the middle. */
export function OrbitDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`orbit-divider ${className}`}>
      <RingedMoon className="h-5 w-5" />
    </div>
  );
}

/**
 * Eight moon phases in a row, new to waning crescent; `tonight` (0 new … 4 full,
 * from lib/moon) is lit in candle and ringed. Decorative.
 */
export function MoonPhases({ tonight = null, className = "" }: { tonight?: number | null; className?: string }) {
  return (
    <svg viewBox="0 0 200 24" className={`moon-phases ${className}`} aria-hidden="true" focusable="false">
      {Array.from({ length: 8 }, (_, i) => {
        const cx = 12.5 + i * 25;
        const lit = litPath(i, cx, 12, 7.5);
        return (
          <g key={i} className={i === tonight ? "moon-tonight" : undefined}>
            <circle cx={cx} cy={12} r={7.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
            {lit && <path d={lit} fill="currentColor" opacity={i === tonight ? 0.9 : 0.45} />}
            {i === tonight && (
              <circle cx={cx} cy={12} r={10.5} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.6} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * A death sign and a life sign side by side, the app's gray area between the
 * two: the first in ash-mauve, the second in lichen.
 */
export function SymbolPair({ death, life, className = "" }: { death: ReactNode; life: ReactNode; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="text-mauve">{death}</span>
      <span className="h-1 w-1 rounded-full bg-border" />
      <span className="text-lichen">{life}</span>
    </span>
  );
}

/** A short space-age label: four words or fewer. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`label text-muted ${className}`}>{children}</p>;
}

type ArchProps<T extends ElementType> = {
  as?: T;
  /** The deco double rule just inside the edge. */
  rule?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/** An arch-topped headstone frame for hero art and key cards. */
export function ArchFrame<T extends ElementType = "section">({ as, rule = true, className = "", children, ...rest }: ArchProps<T>) {
  const Tag = (as ?? "section") as ElementType;
  return (
    <Tag className={`arch ${rule ? "arch-rule" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * The page title every tool shares: a death/life pair above a carved heading,
 * then one plain line in Atkinson. Same rhythm on every page, so moving from
 * home to a tool doesn't change the frame (L10.4).
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
      {/* The pair sits beside the title, so every page's heading starts at the same height. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl leading-tight">{title}</h1>
        <SymbolPair death={death} life={life} className="shrink-0" />
      </div>
      {intro && <p className="text-muted">{intro}</p>}
    </header>
  );
}

/**
 * A numbered step's heading: the numeral in Atkinson inside a candle ring
 * (never IM Fell's old-style figures), then the carved title. Screen readers
 * hear "Step 2: Frame the stone".
 */
export function StepHeading({
  n,
  id,
  as: Tag = "h2",
  children,
}: {
  n: number;
  id?: string;
  as?: "h2" | "h3";
  children: ReactNode;
}) {
  return (
    <Tag id={id} className="step">
      <span className="step-no" aria-hidden="true">
        {n}
      </span>
      <span className="sr-only">Step {n}: </span>
      <span className="font-display text-2xl leading-tight">{children}</span>
    </Tag>
  );
}

/**
 * Something made or found, pinned up: two pins, a square window (on paper for
 * ink, or anything that needs a light ground) and a tag underneath.
 */
export function Specimen({
  paper = false,
  tag,
  children,
  className = "",
}: {
  paper?: boolean;
  tag: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`specimen ${className}`}>
      <div className={`specimen-window ${paper ? "specimen-paper" : ""}`}>{children}</div>
      <figcaption className="specimen-tag">{tag}</figcaption>
    </figure>
  );
}
