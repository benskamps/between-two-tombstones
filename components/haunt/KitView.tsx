"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ToolIcon, ToolTile, type ToolId } from "@/components/ui/tools";
import { micAvailable } from "@/lib/games/evp";
import { cemeteryQuery, hubHref, type Haunt } from "@/lib/haunt/haunt";
import { useHaunt } from "@/lib/haunt/useHaunt";
import { EndGhostPass, GhostPassButton } from "./GhostPass";
import { GateNeutral } from "./PickHauntFirst";

type KitTool = { path: string; hash?: string; title: string; body: string; tool: ToolId; needs?: "mic" };

/** The field kit, in the order a visit uses it. The bodies say what each does, in a line. */
const KIT: KitTool[] = [
  { path: "/stamp", title: "Stamp Kit", body: "A rubbing and two stamps from one photo. The stone is never touched.", tool: "stamp" },
  { path: "/spirit", title: "Spirit Box", body: "Static, then the names of people buried here who died 75+ years ago.", tool: "spirit" },
  { path: "/spirit", hash: "#seance", title: "Séance", body: "Every friend’s phone speaks the same name in the same second.", tool: "seance" },
  { path: "/games/bingo", title: "Tombstone Bingo", body: "Spot willows, urns and hourglasses carved in the stones.", tool: "bingo" },
  { path: "/games/party", title: "Graveyard Party", body: "One link, the same bingo card on every phone.", tool: "party" },
  { path: "/games/whoami", title: "Who Am I?", body: "Three clues from the people buried here. Name them.", tool: "whoami" },
  { path: "/games/stonemath", title: "Stone Math", body: "Turn “aged 34 y’rs 2 m’s 11 d’s” into a birthday.", tool: "stonemath" },
  { path: "/games/evp", title: "EVP Recorder", body: "Record 15 seconds, hear it back reversed and slowed.", tool: "evp", needs: "mic" },
  { path: "/calendar", title: "Haunted Calendar", body: "Their death-days, every year, on your own calendar.", tool: "calendar" },
];

const noSubscribe = () => () => {};

function Unlocked({ haunt }: { haunt: Haunt }) {
  // null on the server: the EVP tile appears only once the phone says it can record.
  const mic = useSyncExternalStore<boolean | null>(noSubscribe, micAvailable, () => null);
  const q = cemeteryQuery(haunt);
  return (
    <div className="space-y-5" data-testid="kit-open">
      {haunt.ghost && (
        <section aria-label="Ghost pass" className="card space-y-2 border-wisp px-4 py-3" data-testid="ghost-pass">
          <p className="font-bold text-wisp">Ghost pass: you&rsquo;re at {haunt.name} in spirit.</p>
          <p className="text-sm text-muted">
            Every tool works. The Stamp Kit has a sample headstone ready. Standing in a real graveyard? Pick it instead and
            the pass ends.
          </p>
          <EndGhostPass />
        </section>
      )}
      <h2 className="font-display text-2xl leading-tight">Open at {haunt.name}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {KIT.filter((t) => t.needs !== "mic" || mic === true).map((t) => (
          <li key={t.title}>
            <ToolTile tool={t.tool} href={`${t.path}?${q}${t.hash ?? ""}`} title={t.title} body={t.body} />
          </li>
        ))}
      </ul>
      <Link href={hubHref(haunt)} className="tap inline-flex items-center font-bold text-mauve underline underline-offset-4">
        Back to the stories at {haunt.name}
      </Link>
    </div>
  );
}

function Locked() {
  return (
    <div className="space-y-5" data-testid="kit-locked">
      <section aria-labelledby="kit-locked-title" className="card bezel space-y-3 px-5 py-6 text-center">
        <h2 id="kit-locked-title" className="font-display text-3xl leading-tight">
          The kit opens at a graveyard
        </h2>
        <p>Pick the one you&rsquo;re standing in, or one you swiped, and these open for that place.</p>
        <Link href="/gravitator" className="btn btn-candle w-full">
          Swipe for a graveyard
        </Link>
        <Link href="/#find" className="tap inline-flex items-center font-bold text-mauve underline underline-offset-4">
          At one now? Find it by location or name
        </Link>
      </section>
      <section aria-labelledby="ghost-title" className="card space-y-2 px-5 py-5">
        <h2 id="ghost-title" className="font-display text-2xl leading-tight">
          No graveyard nearby?
        </h2>
        <p className="text-muted">
          The Ghost pass puts you at Sleepy Hollow&rsquo;s gate in spirit, with a sample headstone in the Stamp Kit. Every
          tool works, and the header says &ldquo;Ghost pass&rdquo; so nobody thinks you&rsquo;re really there.
        </p>
        <GhostPassButton />
      </section>
      <ul aria-label="What opens" className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {KIT.filter((t) => !t.needs).map((t) => (
          <li key={t.title} className="flex items-start gap-3 text-muted">
            <span aria-hidden="true" className="tool-medallion tool-medallion-sm shrink-0">
              <ToolIcon tool={t.tool} />
            </span>
            <span>
              <span className="block font-bold text-text">{t.title}</span>
              <span className="block text-sm">{t.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Kit tab: locked until there's a haunt (picked, or a Ghost pass), then that haunt's tools. */
export function KitView() {
  const haunt = useHaunt();
  if (haunt === undefined) return <GateNeutral />;
  return haunt ? <Unlocked haunt={haunt} /> : <Locked />;
}
