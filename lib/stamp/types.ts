// Shapes shared by the Stamp Kit pipeline (pure functions), the worker and the UI.

export type Point = { x: number; y: number };

/** Four corners of the stone face in source pixels, clockwise: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];

/** Which carving to lift: letters darker than the face, lighter than it, or both edges. */
export type CarveMode = "dark" | "light" | "edges";

export type StampSettings = {
  mode: CarveMode;
  /** Drop specks smaller than this many pixels (measured at a 1000 px image; scaled by area). */
  grit: number;
  /** -3..3: erode (negative) or dilate (positive) the finished mask by that many pixels. */
  stroke: number;
};

export const DEFAULT_SETTINGS: StampSettings = { mode: "dark", grit: 40, stroke: 0 };

export const GRIT_MAX = 200;
export const STROKE_MIN = -3;
export const STROKE_MAX = 3;

/** Words the user typed. All optional. */
export type StampText = {
  name: string;
  born: string;
  died: string;
  /** Age at death: the postage stamp's denomination. */
  age: number | null;
};

export const EMPTY_TEXT: StampText = { name: "", born: "", died: "", age: null };

export type RGBAImage = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
