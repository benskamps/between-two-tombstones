"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RingedMoon } from "@/components/ui/symbols";
import { NEXT_TOOLS } from "@/lib/haunt/haunt";
import { rememberNext } from "@/lib/haunt/next";
import { Doors } from "./Doors";
import { GhostPassButton } from "./GhostPass";
import { FamousCemeteries } from "./Famous";

export type ToolPath = keyof typeof NEXT_TOOLS;

/** Why each tool waits for a haunt, said truthfully (F12). */
const WHY: Record<string, string> = {
  "/stamp": "Every tool opens once you’ve picked your haunt, the cemetery you’re visiting. Pick it below and you’ll come back to the Stamp Kit from there.",
  "/spirit": "The Spirit Box speaks the names of people buried at your haunt. Pick the cemetery you’re visiting below.",
  "/games": "The games open once you’ve picked your haunt, the cemetery you’re visiting. Pick it below.",
  "/games/bingo": "Bingo opens once you’ve picked your haunt, the cemetery you’re visiting. Pick it below. A friend’s party link always opens straight in.",
  "/games/party": "A party starts at your haunt, the cemetery you’re visiting. Pick it below. A friend’s party link always opens straight in.",
  "/games/evp": "The EVP Recorder opens once you’ve picked your haunt, the cemetery you’re visiting. Pick it below.",
  "/calendar": "The Haunted Calendar fills your calendar with the death-days of people buried at your haunt. Pick the cemetery below.",
};

/** Joining someone else's séance or party never needs a haunt (F13): the code box opens straight in. */
const JOIN: Record<string, { href: string; label: string }> = {
  "/spirit": { href: "/spirit?join=1#seance", label: "Joining a friend’s séance? Type the room code" },
  "/games": { href: "/games/party?join=1", label: "Joining a friend’s party? Type the room code" },
  "/games/bingo": { href: "/games/party?join=1", label: "Joining a friend’s party? Type the room code" },
  "/games/party": { href: "/games/party?join=1", label: "Joining a friend’s party? Type the room code" },
};

/**
 * What a tool page shows without a haunt: say why, then the ways in. Never a
 * dead end, never an empty page. Remembers the tool, so the cemetery page you
 * end up on offers "Continue to …" (F12).
 */
export function PickHauntFirst({ tool }: { tool: ToolPath }) {
  useEffect(() => rememberNext(tool), [tool]);
  return (
    <section aria-labelledby="pick-haunt" className="space-y-6" data-testid="pick-haunt">
      <div className="card bezel space-y-2 px-5 py-6 text-center">
        <RingedMoon className="mx-auto h-8 w-8 text-mauve" />
        <h2 id="pick-haunt" className="font-display text-3xl leading-tight">
          Pick a haunt first
        </h2>
        <p>{WHY[tool]}</p>
        {JOIN[tool] && (
          <Link href={JOIN[tool].href} className="tap inline-flex items-center font-bold text-mauve underline underline-offset-4">
            {JOIN[tool].label}
          </Link>
        )}
      </div>
      <div className="card space-y-2 px-5 py-4 text-center">
        <p>
          No graveyard nearby? The Ghost pass puts you at Sleepy Hollow in spirit, and {NEXT_TOOLS[tool]} opens there.
        </p>
        <GhostPassButton to={tool} />
      </div>
      <Doors idPrefix="gate" level={3} />
      <FamousCemeteries id="gate-famous" />
    </section>
  );
}

/**
 * Holds the tool's place while the haunt is read on the phone (the server
 * can't know it): its panel and a disabled button, never an empty page (F15).
 */
export function GateNeutral() {
  return (
    <div className="card space-y-4 p-5" aria-busy="true" data-testid="gate-loading">
      <div className="h-4 w-2/3 rounded-full bg-surface-2" />
      <div className="h-4 w-1/2 rounded-full bg-surface-2" />
      <button type="button" disabled className="btn btn-primary w-full">
        Loading…
      </button>
    </div>
  );
}
