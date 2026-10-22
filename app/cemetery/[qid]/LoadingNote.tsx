import { LONGEST_NOTE, slowLoadingNote, slowNoteDelay } from "@/lib/tour/loading";

/**
 * The loading screen's last line, shown once the wait is long (review pass 4,
 * item 1). Server-rendered and revealed by a CSS animation delay, not a
 * timer: React doesn't hydrate a Suspense fallback that is still waiting on
 * the server, so a client timer would never start on a first load. The
 * animation starts when the line enters the page, on a first load and on an
 * in-app navigation alike, and plays once. An invisible copy of the longest
 * line holds the space from the start, so nothing moves when it appears (CLS 0).
 * `btt-fade-in` is the opacity keyframe in app/globals.css.
 */
export function LoadingNote({ people }: { people: number | null }) {
  return (
    <p className="grid font-bold">
      <span aria-hidden="true" className="invisible [grid-area:1/1]">
        {LONGEST_NOTE}
      </span>
      <span
        className="[grid-area:1/1] [animation:btt-fade-in_0.4s_ease-out_both]"
        style={{ animationDelay: `${slowNoteDelay(people)}ms` }}
        data-testid="loading-note"
      >
        {slowLoadingNote(people)}
      </span>
    </p>
  );
}
