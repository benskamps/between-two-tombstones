"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Point, Quad } from "@/lib/stamp/types";

export const CORNER_NAMES = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"] as const;

const LOUPE = 144; // CSS px
const ZOOM = 3;

type Props = {
  bitmap: ImageBitmap;
  corners: Quad;
  onChange: (q: Quad) => void;
};

/** The photo with four draggable corner handles, a zoom loupe while moving one, and arrow-key nudging. */
export function CornerFramer({ bitmap, corners, onChange }: Props) {
  const W = bitmap.width;
  const H = bitmap.height;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const offset = useRef<Point>({ x: 0, y: 0 });
  const [active, setActive] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    c.width = W;
    c.height = H;
    g.drawImage(bitmap, 0, 0);
  }, [bitmap, W, H]);

  const showLoupe = active !== null && (dragging || nudging);

  useEffect(() => {
    if (!showLoupe || active === null) return;
    const lc = loupeRef.current;
    const src = canvasRef.current;
    const wrap = wrapRef.current;
    const g = lc?.getContext("2d");
    if (!lc || !src || !wrap || !g) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const size = Math.round(LOUPE * dpr);
    if (lc.width !== size) {
      lc.width = size;
      lc.height = size;
    }
    const imgPerCss = W / wrap.getBoundingClientRect().width;
    const span = (LOUPE / ZOOM) * imgPerCss; // image px shown across the loupe
    const p = corners[active];
    const ox = p.x - span / 2;
    const oy = p.y - span / 2;
    const k = size / span;
    g.fillStyle = "#000";
    g.fillRect(0, 0, size, size);
    g.imageSmoothingEnabled = true;
    g.drawImage(src, ox, oy, span, span, 0, 0, size, size);
    // The two edges that meet at this corner, then a crosshair.
    g.strokeStyle = "rgba(226,173,75,0.95)";
    g.lineWidth = 2 * dpr;
    g.beginPath();
    const prev = corners[(active + 3) % 4];
    const next = corners[(active + 1) % 4];
    g.moveTo((prev.x - ox) * k, (prev.y - oy) * k);
    g.lineTo((p.x - ox) * k, (p.y - oy) * k);
    g.lineTo((next.x - ox) * k, (next.y - oy) * k);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1 * dpr;
    g.beginPath();
    g.moveTo(size / 2, size / 2 - 14 * dpr);
    g.lineTo(size / 2, size / 2 + 14 * dpr);
    g.moveTo(size / 2 - 14 * dpr, size / 2);
    g.lineTo(size / 2 + 14 * dpr, size / 2);
    g.stroke();
  }, [showLoupe, active, corners, W]);

  const clampPoint = (p: Point): Point => ({
    x: Math.round(Math.min(W - 1, Math.max(0, p.x))),
    y: Math.round(Math.min(H - 1, Math.max(0, p.y))),
  });

  const move = (i: number, p: Point) => {
    const next = corners.map((c, j) => (j === i ? clampPoint(p) : c)) as Quad;
    onChange(next);
    return next[i];
  };

  const toImage = (clientX: number, clientY: number): Point => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const onPointerDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    const p = toImage(e.clientX, e.clientY);
    offset.current = { x: corners[i].x - p.x, y: corners[i].y - p.y };
    setActive(i);
    setDragging(true);
  };

  const onPointerMove = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!dragging || active !== i) return;
    const p = toImage(e.clientX, e.clientY);
    move(i, { x: p.x + offset.current.x, y: p.y + offset.current.y });
  };

  const onPointerUp = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!dragging) return;
    setDragging(false);
    const c = corners[i];
    setAnnounce(`${CORNER_NAMES[i]} corner at ${c.x}, ${c.y}.`);
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = d[e.key];
    if (!delta) return;
    e.preventDefault();
    setActive(i);
    setNudging(true);
    const p = move(i, { x: corners[i].x + delta.x, y: corners[i].y + delta.y });
    setAnnounce(`${CORNER_NAMES[i]} corner at ${p.x}, ${p.y}.`);
  };

  const loupeOnLeft = active !== null && corners[active].x > W / 2;
  const outline = corners.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div>
      <p id="framer-help" className="mb-2 text-sm text-muted">
        Drag each corner onto a corner of the stone&rsquo;s face. Or tab to a corner and use the arrow keys (hold Shift to
        move 10 pixels).
      </p>
      <div ref={wrapRef} className="relative select-none touch-pan-y" data-testid="framer">
        <canvas
          ref={canvasRef}
          className="block h-auto w-full rounded-lg"
          role="img"
          aria-label="Your photo, with the stone's face outlined"
        />
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <path
            d={`M0 0H${W}V${H}H0Z M${corners.map((p) => `${p.x} ${p.y}`).join(" L")}Z`}
            fill="rgba(0,0,0,0.45)"
            fillRule="evenodd"
          />
          <polygon
            points={outline}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {corners.map((p, i) => (
          <button
            key={CORNER_NAMES[i]}
            type="button"
            aria-label={`${CORNER_NAMES[i]} corner`}
            aria-describedby="framer-help"
            data-corner={i}
            data-x={p.x}
            data-y={p.y}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove(i)}
            onPointerUp={onPointerUp(i)}
            onPointerCancel={onPointerUp(i)}
            onKeyDown={onKeyDown(i)}
            onBlur={() => {
              setNudging(false);
              if (!dragging) setActive(null);
            }}
            className="tap absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full"
            style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}
          >
            <span
              aria-hidden="true"
              className={`block h-5 w-5 rounded-full border-2 border-black bg-accent shadow ${
                active === i ? "scale-125" : ""
              }`}
            />
          </button>
        ))}
        {showLoupe && (
          <canvas
            ref={loupeRef}
            aria-hidden="true"
            data-testid="loupe"
            className={`pointer-events-none absolute top-2 rounded-full border-4 border-accent shadow-lg ${
              loupeOnLeft ? "left-2" : "right-2"
            }`}
            style={{ width: LOUPE, height: LOUPE }}
          />
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
