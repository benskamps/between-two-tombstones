// A tiny external store over localStorage for the games, for useSyncExternalStore.
// Every access is wrapped: private mode or blocked storage falls back to memory
// for this visit instead of crashing.

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function readItem(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    // Storage blocked; use memory.
  }
  return memory.get(key) ?? null;
}

export function writeItem(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full; memory keeps it for this visit.
  }
  for (const l of listeners) l();
}

export function subscribeStorage(listener: () => void): () => void {
  listeners.add(listener);
  // Other tabs changing the same keys.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export const SOLO_SEED_KEY = "btt-bingo-seed";

export function marksKey(seed: string): string {
  return `btt-bingo-marks:${seed}`;
}

/** Marked squares from storage: a JSON array of indexes 0–24. Bad data → none marked. */
export function parseMarks(raw: string | null): Set<number> {
  if (!raw) return new Set();
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return new Set();
    return new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 25));
  } catch {
    return new Set();
  }
}
