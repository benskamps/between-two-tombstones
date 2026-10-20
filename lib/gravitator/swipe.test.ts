import { describe, expect, it } from "vitest";
import { decideSwipe, dragProgress, dragRotation, keyAction, velocityOf } from "./swipe";

describe("decideSwipe", () => {
  it("decides past 30% of the card width", () => {
    expect(decideSwipe(120, 400, 0)).toBe("save");
    expect(decideSwipe(-120, 400, 0)).toBe("pass");
    expect(decideSwipe(119, 400, 0)).toBeNull();
  });

  it("decides on a fast flick even when short", () => {
    expect(decideSwipe(50, 400, 0.9)).toBe("save");
    expect(decideSwipe(-50, 400, -0.9)).toBe("pass");
    // Too short, or flicked back the other way: no decision.
    expect(decideSwipe(20, 400, 0.9)).toBeNull();
    expect(decideSwipe(50, 400, -0.9)).toBeNull();
    expect(decideSwipe(50, 400, 0.3)).toBeNull();
  });

  it("ignores nonsense", () => {
    expect(decideSwipe(200, 0, 0)).toBeNull();
    expect(decideSwipe(Number.NaN, 400, 0)).toBeNull();
  });
});

describe("drag feedback", () => {
  it("tilts a few degrees, capped, and not at all with reduced motion", () => {
    expect(dragRotation(100, 400, false)).toBeCloseTo(4.9, 1);
    expect(dragRotation(4000, 400, false)).toBe(14);
    expect(dragRotation(-4000, 400, false)).toBe(-14);
    expect(dragRotation(100, 400, true)).toBe(0);
  });

  it("reaches full tint at the threshold", () => {
    expect(dragProgress(60, 400)).toBeCloseTo(0.5);
    expect(dragProgress(-500, 400)).toBe(1);
  });

  it("measures velocity over the last 100 ms", () => {
    expect(velocityOf([{ x: 0, t: 0 }, { x: 0, t: 400 }, { x: 50, t: 450 }, { x: 100, t: 500 }])).toBeCloseTo(1);
    expect(velocityOf([{ x: 0, t: 0 }])).toBe(0);
  });
});

describe("keys", () => {
  it("maps ← pass, → save, ↑ and Enter go now", () => {
    expect(keyAction("ArrowLeft")).toBe("pass");
    expect(keyAction("ArrowRight")).toBe("save");
    expect(keyAction("ArrowUp")).toBe("go");
    expect(keyAction("Enter")).toBe("go");
    expect(keyAction("ArrowDown")).toBeNull();
    expect(keyAction(" ")).toBeNull();
  });
});
