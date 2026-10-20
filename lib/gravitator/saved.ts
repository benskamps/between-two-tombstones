// Saved graveyards, kept on this phone only (localStorage, decision 8). Every
// access is wrapped: private mode or blocked storage falls back to memory for
// this visit instead of crashing. Shaped for useSyncExternalStore.

export const SAVED_KEY = "btt-gravitator-saved";
const MAX_SAVED = 200;

export type SavedGraveyard = {
  qid: string;
  name: string;
  place: string | null;
  lat: number;
  lon: number;
  image: string | null;
  savedAt: string;
};

let memory: string | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    const v = localStorage.getItem(SAVED_KEY);
    if (v !== null) return v;
  } catch {
    // Storage blocked; memory has this visit's saves.
  }
  return memory;
}

function writeRaw(value: string) {
  memory = value;
  try {
    localStorage.setItem(SAVED_KEY, value);
  } catch {
    // Blocked or full: memory keeps it for this visit.
  }
  for (const l of listeners) l();
}

const QID_RE = /^Q[1-9]\d*$/;

/** Stored JSON → saved list. Bad entries are dropped, bad JSON → empty. */
export function parseSaved(raw: string | null): SavedGraveyard[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (s): s is SavedGraveyard =>
        !!s &&
        typeof s === "object" &&
        typeof s.qid === "string" &&
        QID_RE.test(s.qid) &&
        typeof s.name === "string" &&
        typeof s.lat === "number" &&
        typeof s.lon === "number",
    );
  } catch {
    return [];
  }
}

// useSyncExternalStore needs a stable snapshot: re-parse only when the raw string changes.
let cacheRaw: string | null | undefined;
let cacheList: SavedGraveyard[] = [];

export function getSaved(): SavedGraveyard[] {
  const raw = readRaw();
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheList = parseSaved(raw);
  }
  return cacheList;
}

/** Server render and first paint: what this phone saved isn't known yet. */
export function getSavedServer(): SavedGraveyard[] | null {
  return null;
}

export function subscribeSaved(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Newest first; saving one that's already there moves it to the top. */
export function addSaved(g: Omit<SavedGraveyard, "savedAt">, now = new Date()): void {
  const rest = getSaved().filter((s) => s.qid !== g.qid);
  const entry: SavedGraveyard = { ...g, savedAt: now.toISOString() };
  writeRaw(JSON.stringify([entry, ...rest].slice(0, MAX_SAVED)));
}

export function removeSaved(qid: string): void {
  writeRaw(JSON.stringify(getSaved().filter((s) => s.qid !== qid)));
}

/** Test hook. */
export function resetSavedMemory(): void {
  memory = null;
  cacheRaw = undefined;
  cacheList = [];
}
