import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { RingedMoon } from "./symbols";

/*
  Shared forms for the gothic retro-futurist skin. All decoration is CSS (see
  app/globals.css: .arch, .card, .bezel, .instrument, .fence, .orbit-divider)
  or inline SVG in currentColor, hidden from assistive tech.
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
