"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SampleCemetery } from "@/lib/spirit/load";
import { QID_RE } from "@/lib/spirit/load";
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
    // Never a dead end (F13): ?join=1 opens the room-code box with no haunt
    // needed, on the host's cemetery when the link still names it.
    const hostCemetery = params.get("cemetery");
    const join = `/spirit?join=1${hostCemetery && QID_RE.test(hostCemetery) ? `&cemetery=${hostCemetery}` : ""}#seance`;
    return (
      <div className="space-y-3 card p-4">
        <p role="alert" className="text-danger">
          <span className="font-bold">{link.message}</span> Ask for the link again, or type the room code instead.
        </p>
        <Link href={join} className="btn btn-primary w-full">
          Type the room code
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
