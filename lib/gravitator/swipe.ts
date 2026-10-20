// Pure gesture and key logic for the swipe deck, so it can be unit-tested.

export type DeckAction = "save" | "pass" | "go";

/** A drag past this share of the card's width decides. */
export const SWIPE_THRESHOLD = 0.3;
/** A fast flick (px per ms) decides even when short… */
export const FLING_VELOCITY = 0.6;
/** …as long as it moved at least this far. */
export const FLING_MIN_PX = 40;
/** Movement under this is a tap, not a drag. */
export const TAP_SLOP_PX = 8;
const MAX_ROTATION_DEG = 14;

export function decideSwipe(dx: number, width: number, velocity: number): "save" | "pass" | null {
  if (!(width > 0) || !Number.isFinite(dx)) return null;
  const dir = dx > 0 ? "save" : "pass";
  if (Math.abs(dx) >= width * SWIPE_THRESHOLD) return dir;
  if (Math.abs(velocity) >= FLING_VELOCITY && Math.abs(dx) >= FLING_MIN_PX && Math.sign(velocity) === Math.sign(dx)) {
    return dir;
  }
  return null;
}

/** A few degrees of tilt while dragging; none with reduced motion. */
export function dragRotation(dx: number, width: number, reducedMotion: boolean): number {
  if (reducedMotion || !(width > 0)) return 0;
  const deg = (dx / width) * MAX_ROTATION_DEG * 1.4;
  return Math.max(-MAX_ROTATION_DEG, Math.min(MAX_ROTATION_DEG, deg));
}

/** 0 → 1 as the drag approaches the decision threshold (drives the tint and stamp). */
export function dragProgress(dx: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.max(0, Math.min(1, Math.abs(dx) / (width * SWIPE_THRESHOLD)));
}

/** Velocity in px/ms from recent pointer samples (the last 100 ms). */
export function velocityOf(samples: { x: number; t: number }[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const recent = samples.filter((s) => last.t - s.t <= 100);
  const first = recent[0] ?? samples[0];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** ← pass, → save, ↑ or Enter go now. */
export function keyAction(key: string): DeckAction | null {
  switch (key) {
    case "ArrowLeft":
      return "pass";
    case "ArrowRight":
      return "save";
    case "ArrowUp":
    case "Enter":
      return "go";
    default:
      return null;
  }
}
