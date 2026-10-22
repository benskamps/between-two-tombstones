import type { Metadata } from "next";
import { PassportView, type SampleBurialsMap } from "@/components/passport/PassportView";
import { PageHeader } from "@/components/ui/Motifs";
import { Sprout } from "@/components/ui/symbols";
import oakland from "@/data/snapshots/oakland-atlanta.json";
import sleepyHollow from "@/data/snapshots/sleepy-hollow.json";
import type { CemeterySnapshot } from "@/lib/types";

export const metadata: Metadata = {
  title: "Graveyard Passport",
  description: "Your on-phone graveyard ledger: haunts visited, graves pinned, stamps made, and mourning badges earned.",
};

const SAMPLE_BURIALS: SampleBurialsMap = {
  [oakland.cemetery.qid]: {
    name: oakland.cemetery.name,
    people: (oakland as CemeterySnapshot).people,
  },
  [sleepyHollow.cemetery.qid]: {
    name: sleepyHollow.cemetery.name,
    people: (sleepyHollow as CemeterySnapshot).people,
  },
};

export default function PassportPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Graveyard Passport"
        tool="passport"
        life={<Sprout className="h-5 w-5" />}
        intro={
          <>
            Every cemetery you haunt, stone you press, pin you drop and riddle you solve stays in this pocket ledger on
            your phone.
          </>
        }
      />
      <PassportView sampleBurials={SAMPLE_BURIALS} />
    </div>
  );
}
