// Geometry for the kit sheet and story layouts, and small helpers the worker uses.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { width: number; height: number };

/** Largest rect with the source aspect that fits inside `box`, centred. */
export function fitRect(src: Size, box: Rect): Rect {
  const s = Math.min(box.w / src.width, box.h / src.height);
  const w = src.width * s;
  const h = src.height * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export type KitKind = "sheet" | "story";

export const KIT_SIZES: Record<KitKind, Size> = {
  sheet: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

export type KitLayout = {
  size: Size;
  title: Rect;
  rubbing: Rect;
  ink: Rect;
  postage: Rect;
  footer: Rect;
};

/**
 * Sheet (4:5): title band, the rubbing large on the left, ink stamp and postage
 * stamp stacked on the right, footer. Story (9:16): title, rubbing, the two
 * stamps side by side, footer. Boxes; renders are fitted inside them.
 */
export function kitLayout(kind: KitKind): KitLayout {
  const size = KIT_SIZES[kind];
  const m = 60;
  if (kind === "sheet") {
    const top = 230;
    const bottom = size.height - 110;
    const leftW = 560;
    const rightX = m + leftW + 30;
    const rightW = size.width - m - rightX;
    const half = (bottom - top - 30) / 2;
    return {
      size,
      title: { x: m, y: 50, w: size.width - 2 * m, h: top - 70 },
      rubbing: { x: m, y: top, w: leftW, h: bottom - top },
      ink: { x: rightX, y: top, w: rightW, h: half },
      postage: { x: rightX, y: top + half + 30, w: rightW, h: half },
      footer: { x: m, y: bottom + 20, w: size.width - 2 * m, h: size.height - bottom - 40 },
    };
  }
  const top = 300;
  const rubbingH = 900;
  const rowY = top + rubbingH + 40;
  const rowH = size.height - 150 - rowY;
  const colW = (size.width - 2 * m - 40) / 2;
  return {
    size,
    title: { x: m, y: 90, w: size.width - 2 * m, h: top - 120 },
    rubbing: { x: m, y: top, w: size.width - 2 * m, h: rubbingH },
    ink: { x: m, y: rowY, w: colW, h: rowH },
    postage: { x: m + colW + 40, y: rowY, w: colW, h: rowH },
    footer: { x: m, y: size.height - 130, w: size.width - 2 * m, h: 80 },
  };
}

/** Bounding size of a w×h rect rotated by `deg`. */
export function rotatedBounds(w: number, h: number, deg: number): Size {
  const a = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { width: Math.ceil(w * c + h * s), height: Math.ceil(w * s + h * c) };
}

/** Centres of perforation bites along a w×h stamp edge: whole number per side, evenly spaced. */
export function perforationCentres(w: number, h: number, radius: number): { x: number; y: number }[] {
  const pitch = radius * 2.6;
  const out: { x: number; y: number }[] = [];
  const nx = Math.max(2, Math.round(w / pitch));
  const ny = Math.max(2, Math.round(h / pitch));
  for (let i = 0; i <= nx; i++) {
    const x = (i * w) / nx;
    out.push({ x, y: 0 }, { x, y: h });
  }
  for (let j = 1; j < ny; j++) {
    const y = (j * h) / ny;
    out.push({ x: 0, y }, { x: w, y });
  }
  return out;
}
