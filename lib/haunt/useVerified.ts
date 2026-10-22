"use client";

import { useEffect, useSyncExternalStore } from "react";
import { VERIFIED_SAMPLES } from "./haunt";
import { getVerified, requestVerified, subscribeVerified, type VerifiedCemetery } from "./verify";

/**
 * The cemetery's name from our own data (K2): a sample's straight away, any
 * other's once the burials route answers. undefined while waiting (and on the
 * server), null when it couldn't be checked. Pass null to ask nothing.
 */
export function useVerifiedCemetery(qid: string | null): VerifiedCemetery | null | undefined {
  const sample = qid ? VERIFIED_SAMPLES.find((s) => s.qid === qid) : undefined;
  const looked = useSyncExternalStore(
    subscribeVerified,
    () => getVerified(sample ? null : qid),
    () => undefined,
  );
  useEffect(() => {
    if (qid && !sample) requestVerified(qid);
  }, [qid, sample]);
  if (sample) return { qid: sample.qid, name: sample.name, ...(sample.place ? { place: sample.place } : {}) };
  return looked;
}
