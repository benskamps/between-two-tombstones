// The two sample cemeteries, reduced to the fields the spirit box needs. Import
// this from Server Components only: the full snapshots (with Wikipedia text)
// stay on the server and only these slim lists reach the phone.

import oakland from "../../data/snapshots/oakland-atlanta.json";
import sleepyHollow from "../../data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot } from "../types";
import type { SampleCemetery } from "./load";
import { toSpiritPerson } from "./load";
import type { SpiritPerson } from "./wordbank";

function slim(snapshot: CemeterySnapshot, place: string): SampleCemetery {
  return {
    qid: snapshot.cemetery.qid,
    name: snapshot.cemetery.name,
    place,
    fetchedAt: snapshot.fetchedAt,
    people: snapshot.people.map(toSpiritPerson).filter((p): p is SpiritPerson => p !== null),
  };
}

export const SAMPLE_CEMETERIES: SampleCemetery[] = [
  slim(oakland as CemeterySnapshot, "Atlanta, Georgia"),
  slim(sleepyHollow as CemeterySnapshot, "Sleepy Hollow, New York"),
];
