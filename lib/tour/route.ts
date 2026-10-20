// "Best walking route": an open path through the located graves. Nearest
// neighbor from the visitor (or the first stop), then 2-opt improvements,
// capped so a big cemetery never spins the phone.

export type Point = { lat: number; lon: number };
export type Stop = Point & { id: string };

export const MAX_TWO_OPT_ITERATIONS = 200;

/** Metres between two points (haversine). */
export function distanceM(a: Point, b: Point): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceM(points[i - 1], points[i]);
  return total;
}

function nearestNeighbor(stops: Stop[], start: Point | null): Stop[] {
  const left = [...stops];
  const out: Stop[] = [];
  let here: Point | null = start;
  if (!here) {
    here = left.shift()!;
    out.push(here as Stop);
  }
  while (left.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = distanceM(here, left[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    here = left.splice(best, 1)[0];
    out.push(here as Stop);
  }
  return out;
}

/**
 * Improve an open path by reversing segments. `fixedStart` (the visitor) is
 * the path's first point and never moves. Returns the number of improving
 * reversals applied (≤ maxIterations).
 */
function twoOpt(path: Point[], firstMovable: number, maxIterations: number): number {
  let iterations = 0;
  let improved = true;
  while (improved && iterations < maxIterations) {
    improved = false;
    for (let i = firstMovable; i < path.length - 1 && iterations < maxIterations; i++) {
      for (let j = i + 1; j < path.length && iterations < maxIterations; j++) {
        const a = i > 0 ? path[i - 1] : null;
        const b = path[i];
        const c = path[j];
        const d = j + 1 < path.length ? path[j + 1] : null;
        const before = (a ? distanceM(a, b) : 0) + (d ? distanceM(c, d) : 0);
        const after = (a ? distanceM(a, c) : 0) + (d ? distanceM(b, d) : 0);
        if (after + 1e-6 < before) {
          const seg = path.slice(i, j + 1).reverse();
          path.splice(i, seg.length, ...seg);
          iterations++;
          improved = true;
        }
      }
    }
  }
  return iterations;
}

export type PlannedRoute = { stops: Stop[]; lengthM: number; iterations: number };

export function planRoute(stops: Stop[], start: Point | null = null, maxIterations = MAX_TWO_OPT_ITERATIONS): PlannedRoute {
  if (stops.length === 0) return { stops: [], lengthM: 0, iterations: 0 };
  const greedy = nearestNeighbor(stops, start);
  const path: Point[] = start ? [start, ...greedy] : [...greedy];
  const iterations = twoOpt(path, start ? 1 : 0, maxIterations);
  const ordered = (start ? path.slice(1) : path) as Stop[];
  return { stops: ordered, lengthM: Math.round(pathLength(path)), iterations };
}
