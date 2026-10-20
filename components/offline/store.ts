// On-the-phone storage (decision 8): downloaded tours and "I found it" pins in
// IndexedDB via idb-keyval, in a database of our own so other lanes' keys
// can't collide. Browser-only; every call fails soft when IndexedDB is missing.

import { createStore, del, get, set, update, type UseStore } from "idb-keyval";
import type { CemeterySnapshot } from "@/lib/types";

export const DB_NAME = "btt-offline";
export const MAX_SAVED_TOURS = 20;
export const MAX_PINS_PER_CEMETERY = 500;

let store: UseStore | null = null;

function db(): UseStore {
  if (typeof indexedDB === "undefined") throw new Error("This browser has no IndexedDB, so nothing can be saved on the phone.");
  store ??= createStore(DB_NAME, "kv");
  return store;
}

export type SavedTourData = CemeterySnapshot & { origin?: string };

export type SavedTour = { qid: string; savedAt: string; data: SavedTourData };

export type SavedTourSummary = { qid: string; name: string; locatedIn: string | null; savedAt: string; people: number };

export type Pin = {
  personQid: string;
  cemeteryQid: string;
  lat: number;
  lon: number;
  /** Metres, from the phone's GPS. */
  accuracy: number;
  /** ISO time the pin was taken. */
  at: string;
};

const tourKey = (qid: string) => `tour:${qid}`;
const pinsKey = (cemeteryQid: string) => `pins:${cemeteryQid}`;
const INDEX = "tours";

/** Save the full tour (every person and story) for offline use. Keeps the 20 most recent. */
export async function saveTour(data: SavedTourData): Promise<SavedTour> {
  const qid = data.cemetery.qid;
  const saved: SavedTour = { qid, savedAt: new Date().toISOString(), data };
  await set(tourKey(qid), saved, db());
  let evicted: string[] = [];
  await update<SavedTourSummary[]>(
    INDEX,
    (list) => {
      const summary: SavedTourSummary = {
        qid,
        name: data.cemetery.name,
        locatedIn: data.cemetery.locatedIn,
        savedAt: saved.savedAt,
        people: data.people.length,
      };
      const next = [summary, ...(list ?? []).filter((t) => t.qid !== qid)];
      evicted = next.slice(MAX_SAVED_TOURS).map((t) => t.qid);
      return next.slice(0, MAX_SAVED_TOURS);
    },
    db(),
  );
  for (const old of evicted) await del(tourKey(old), db());
  return saved;
}

export async function getSavedTour(qid: string): Promise<SavedTour | null> {
  try {
    return (await get<SavedTour>(tourKey(qid), db())) ?? null;
  } catch {
    return null;
  }
}

export async function listSavedTours(): Promise<SavedTourSummary[]> {
  try {
    return (await get<SavedTourSummary[]>(INDEX, db())) ?? [];
  } catch {
    return [];
  }
}

export async function removeSavedTour(qid: string): Promise<void> {
  await del(tourKey(qid), db());
  await update<SavedTourSummary[]>(INDEX, (list) => (list ?? []).filter((t) => t.qid !== qid), db());
}

export async function getPins(cemeteryQid: string): Promise<Record<string, Pin>> {
  try {
    return (await get<Record<string, Pin>>(pinsKey(cemeteryQid), db())) ?? {};
  } catch {
    return {};
  }
}

export async function savePin(pin: Pin): Promise<Record<string, Pin>> {
  let result: Record<string, Pin> = {};
  await update<Record<string, Pin>>(
    pinsKey(pin.cemeteryQid),
    (pins) => {
      const next = { ...(pins ?? {}), [pin.personQid]: pin };
      const keys = Object.keys(next);
      if (keys.length > MAX_PINS_PER_CEMETERY) {
        // Drop the oldest pins beyond the cap.
        keys.sort((a, b) => next[a].at.localeCompare(next[b].at));
        for (const k of keys.slice(0, keys.length - MAX_PINS_PER_CEMETERY)) delete next[k];
      }
      result = next;
      return next;
    },
    db(),
  );
  return result;
}

export async function removePin(cemeteryQid: string, personQid: string): Promise<Record<string, Pin>> {
  let result: Record<string, Pin> = {};
  await update<Record<string, Pin>>(
    pinsKey(cemeteryQid),
    (pins) => {
      const next = { ...(pins ?? {}) };
      delete next[personQid];
      result = next;
      return next;
    },
    db(),
  );
  return result;
}
