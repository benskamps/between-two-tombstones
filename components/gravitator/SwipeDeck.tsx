"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cardLabel, haversineKm, tourHref } from "@/lib/gravitator/format";
import { addSaved } from "@/lib/gravitator/saved";
import {
  decideSwipe,
  dragProgress,
  dragRotation,
  keyAction,
  TAP_SLOP_PX,
  velocityOf,
  type DeckAction,
} from "@/lib/gravitator/swipe";
import type { GraveyardProfile } from "@/lib/gravitator/types";
import { MatchDialog } from "./MatchDialog";
import { ProfileFace } from "./ProfileCard";

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => matchMedia(REDUCED).matches,
    () => false,
  );
}

/** How long the leaving card animates before the next one takes over. */
const FLING_MS = 320;
const FADE_MS = 160;

type Drag = {
  id: number;
  x0: number;
  y0: number;
  dx: number;
  active: boolean;
  width: number;
  samples: { x: number; t: number }[];
};

/** Paints the drag: position, tilt, tint and stamp. Imperative, so a drag doesn't re-render React. */
function paint(el: HTMLElement, dx: number, reduced: boolean) {
  const width = el.offsetWidth;
  const rot = dragRotation(dx, width, reduced);
  el.style.transform = dx === 0 ? "" : `translateX(${dx}px)${rot ? ` rotate(${rot}deg)` : ""}`;
  const p = dragProgress(dx, width);
  const set = (sel: string, v: number) => {
    const n = el.querySelector<HTMLElement>(sel);
    if (n) n.style.opacity = String(v);
  };
  set(".g-tint-save", dx > 0 ? p * 0.3 : 0);
  set(".g-tint-pass", dx < 0 ? p * 0.3 : 0);
  set(".g-stamp-save", dx > 0 ? p : 0);
  set(".g-stamp-pass", dx < 0 ? p : 0);
}

export type SwipeDeckProps = {
  cards: GraveyardProfile[];
  /** The visitor's point (not rounded), for distances. */
  origin: { lat: number; lon: number };
  /** Rendered when the deck runs out; focus moves there. */
  renderEnd: () => ReactNode;
};

export function SwipeDeck({ cards, origin, renderEnd }: SwipeDeckProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<"save" | "pass" | null>(null);
  const [match, setMatch] = useState<GraveyardProfile | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [now] = useState(() => new Date());

  const topRef = useRef<HTMLElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wantFocus = useRef(false);

  const top = cards[index] ?? null;
  const next = cards[index + 1] ?? null;
  const km = (c: GraveyardProfile) => haversineKm(origin, c);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // After a decision, keyboard and screen-reader focus follows to the next card (or the end).
  useEffect(() => {
    if (!wantFocus.current || match) return;
    wantFocus.current = false;
    (topRef.current ?? endRef.current)?.focus();
  }, [index, match]);

  // Focus the first card when the deck appears: the visitor just asked for it.
  useEffect(() => {
    topRef.current?.focus({ preventScroll: true });
  }, []);

  function announce(text: string) {
    // Toggle a trailing space so the same sentence twice is still read twice.
    setAnnouncement((prev) => (prev === text ? `${text} ` : text));
  }

  function act(action: DeckAction) {
    if (!top || busy.current || match) return;
    if (action === "go") {
      announce(`Opening the tour of ${top.name}.`);
      router.push(tourHref(top.qid));
      return;
    }
    busy.current = true;
    const card = top;
    if (action === "save") {
      addSaved({ qid: card.qid, name: card.name, place: card.place, lat: card.lat, lon: card.lon, image: card.image });
    }
    const el = topRef.current;
    if (el) {
      // Show which way it went, even from a button or key press.
      for (const [sel, on] of [
        [".g-stamp-save", action === "save"],
        [".g-stamp-pass", action === "pass"],
      ] as const) {
        const n = el.querySelector<HTMLElement>(sel);
        if (n) n.style.opacity = on ? "1" : "0";
      }
      if (!reduced) {
        // Fling off the side, continuing from wherever a drag left it.
        const width = el.offsetWidth || 360;
        const sign = action === "save" ? 1 : -1;
        el.style.transform = `translateX(${sign * width * 1.5}px) rotate(${sign * 22}deg)`;
      }
    }
    setLeaving(action);
    timer.current = setTimeout(
      () => {
        timer.current = null;
        wantFocus.current = true;
        setLeaving(null);
        setExpanded(false);
        setIndex((i) => i + 1);
        if (action === "save") {
          setMatch(card);
          announce(`Saved ${card.name}. It's a match.`);
        } else {
          announce(`Passed on ${card.name}.`);
        }
        busy.current = false;
      },
      reduced ? FADE_MS : FLING_MS,
    );
  }

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    if (busy.current || e.button !== 0 || !e.isPrimary) return;
    if ((e.target as Element).closest("a, button, input, select, textarea")) return;
    const el = e.currentTarget;
    el.classList.remove("g-card-settle");
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      active: false,
      width: el.offsetWidth,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.active) {
      if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) return;
      // Mostly vertical: it's a scroll, not a swipe.
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      d.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.dragging = "true";
    }
    d.dx = dx;
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    if (d.samples.length > 12) d.samples.shift();
    paint(e.currentTarget, dx, reduced);
  }

  function settle(el: HTMLElement) {
    if (!reduced) el.classList.add("g-card-settle");
    paint(el, 0, reduced);
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || e.pointerId !== d.id) return;
    const el = e.currentTarget;
    delete el.dataset.dragging;
    if (!d.active) {
      setExpanded((x) => !x); // a tap opens the full profile
      return;
    }
    const dir = decideSwipe(d.dx, d.width, velocityOf(d.samples));
    if (dir) act(dir);
    else settle(el);
  }

  function onPointerCancel(e: PointerEvent<HTMLElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || e.pointerId !== d.id) return;
    delete e.currentTarget.dataset.dragging;
    settle(e.currentTarget);
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    const action = keyAction(e.key);
    if (!action) return;
    e.preventDefault();
    act(action);
  }

  function closeMatch() {
    setMatch(null);
    wantFocus.current = true;
  }

  const leavingClass = leaving ? (reduced ? " g-card-fade" : " g-card-fling") : "";

  return (
    <div>
      <p className="sr-only" id="g-deck-help">
        Left arrow to pass, right arrow to save, Enter or up arrow to go now. You can also drag the card or use the
        buttons below it.
      </p>
      <div className="g-stack" aria-label="Cemetery profiles" role="group">
        {next && (
          <article key={next.qid} className={`g-card${leaving ? "" : " g-card-under"}`} inert>
            <ProfileFace card={next} km={km(next)} expanded={false} interactive={false} now={now} />
          </article>
        )}
        {top && (
          <article
            key={top.qid}
            ref={topRef}
            tabIndex={0}
            className={`g-card${leavingClass}`}
            data-qid={top.qid}
            data-expanded={expanded ? "true" : "false"}
            aria-label={cardLabel(top, km(top), index, cards.length)}
            aria-describedby="g-deck-help"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onKeyDown={onKeyDown}
          >
            <ProfileFace
              card={top}
              km={km(top)}
              expanded={expanded}
              onToggleExpanded={() => setExpanded((x) => !x)}
              interactive
              now={now}
            />
          </article>
        )}
        {!top && (
          <div ref={endRef} tabIndex={-1} className="flex h-full items-center">
            {renderEnd()}
          </div>
        )}
      </div>

      {top && (
        <div className="g-actions mt-4">
          <button type="button" className="g-btn g-btn-ash" onClick={() => act("pass")} disabled={!!leaving}>
            <span aria-hidden="true">✕</span> Pass
          </button>
          <Link
            href={tourHref(top.qid)}
            prefetch={false}
            className="g-btn g-btn-candle"
            onClick={() => announce(`Opening the tour of ${top.name}.`)}
          >
            Go now <span aria-hidden="true">→</span>
          </Link>
          <button type="button" className="g-btn g-btn-mauve" onClick={() => act("save")} disabled={!!leaving}>
            <span aria-hidden="true">♥</span> Save
          </button>
        </div>
      )}
      {top && (
        <p className="mt-2 text-center text-sm text-(--g-muted)" aria-hidden="true">
          {index + 1} of {cards.length} · drag, tap the buttons, or use ← → and Enter
        </p>
      )}

      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      {match && <MatchDialog card={match} km={km(match)} onClose={closeMatch} />}
    </div>
  );
}
