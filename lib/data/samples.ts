// The committed offline snapshots (data/snapshots/, written by
// scripts/snapshot.mjs). Used when the live call for a sample cemetery fails.
import oakland from "@/data/snapshots/oakland-atlanta.json";
import sleepyHollow from "@/data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot } from "@/lib/types";

export const SAVED_SNAPSHOTS: Readonly<Record<string, CemeterySnapshot>> = {
  Q2008469: oakland as CemeterySnapshot,
  Q360779: sleepyHollow as CemeterySnapshot,
};

export function savedSnapshot(qid: string): CemeterySnapshot | null {
  return SAVED_SNAPSHOTS[qid] ?? null;
}
