"use client";

import { useRouter } from "next/navigation";
import { GHOST_PASS } from "@/lib/haunt/haunt";
import { clearHaunt, setHaunt } from "@/lib/haunt/store";

/**
 * The Ghost pass (decision 29): for anyone with no graveyard nearby. One tap
 * makes Sleepy Hollow the haunt, flagged as a ghost, and opens `to` (the kit,
 * or the tool that asked for a haunt). The header then says "Ghost pass", so
 * nothing pretends you're really there.
 */
export function GhostPassButton({ to = "/kit", className = "btn btn-primary w-full" }: { to?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setHaunt(GHOST_PASS);
        router.push(to);
      }}
    >
      Take the Ghost pass
    </button>
  );
}

/** Ends the Ghost pass: the haunt goes, and the kit locks again. */
export function EndGhostPass() {
  return (
    <button type="button" className="btn btn-ghost" onClick={() => clearHaunt()}>
      End the Ghost pass
    </button>
  );
}
