"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SampleCemetery } from "@/lib/spirit/load";
import { readSeanceLink } from "@/lib/spirit/seance";
import { capsFromParam } from "@/lib/spirit/session";
import { SeanceBox } from "./SeanceBox";
import { SpiritBox } from "./SpiritBox";

/**
 * /spirit on its own is the spirit box; /spirit?seance=ROOM&cemetery=Q…&bank=…
 * is séance mode. Switching between them remounts, so the old mode's audio,
 * speech and timers are all stopped by its unmount cleanup.
 */
export function SpiritModes({ samples }: { samples: SampleCemetery[] }) {
  const params = useSearchParams();
  const link = readSeanceLink((name) => params.get(name), samples[0].qid);

  if (link === null) return <SpiritBox samples={samples} />;
  if (!link.ok) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <p role="alert" className="font-bold text-danger">
          {link.message} Ask for the link again, or type the code on the spirit box page.
        </p>
        <Link href="/spirit#seance" className="tap flex items-center justify-center rounded-xl border border-border px-5 font-bold">
          Go to the spirit box
        </Link>
      </div>
    );
  }
  const { caps, test } = capsFromParam(params.get("test-caps"));
  return (
    <SeanceBox
      key={`${link.room}|${link.cemetery}|${link.bank ?? ""}`}
      samples={samples}
      room={link.room}
      cemetery={link.cemetery}
      linkBank={link.bank}
      caps={caps}
      test={test}
    />
  );
}
