"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { calendarName, cemeteryLabel, cemeterySlug } from "@/lib/calendar/feed";
import type { EventKind } from "@/lib/calendar/kinds";
import { feedPath, subscribeLinks } from "@/lib/calendar/params";
import type { CalendarSample } from "@/lib/calendar/samples";
import { localToday, readFeed, upcoming, ymdKey, type PreviewFeed } from "@/lib/calendar/upcoming";
import { useHaunt } from "@/lib/haunt/useHaunt";
import type { YMD } from "@/lib/stonemath";
import { Sprout } from "@/components/ui/games/Sprout";
import { Moth } from "@/components/ui/symbols";
import "./almanac.css";

const PREVIEW_COUNT = 5;
const SUBSCRIBE_LABEL = {
  apple: "Add to Apple Calendar",
  google: "Add to Google Calendar",
  outlook: "Add to Outlook",
} as const;

/** The three subscribe buttons, the detected platform's first. */
function order(platform: Platform | null): Platform[] {
  const first = platform ?? "google";
  return [first, ...(["apple", "google", "outlook"] as const).filter((p) => p !== first)];
}
const QID_RE = /^Q[1-9]\d{0,9}$/;

/** A cemetery passed in from its tour page (`?cemetery=&name=&place=`), not one of the samples. */
function fromTourPage(qid: string, name: string | null, place: string | null): CalendarSample {
  const cemetery = { qid, name: name?.trim().slice(0, 120) || qid, locatedIn: place?.trim().slice(0, 80) || null };
  return {
    qid,
    name: cemetery.name,
    place: cemetery.locatedIn ?? "",
    label: cemeteryLabel(cemetery),
    calendarName: calendarName(cemetery),
    slug: cemeterySlug(cemetery),
  };
}
const FETCH_TIMEOUT_MS = 10_000;

const NOT_PUBLIC =
  "Subscribing works once the app is on its public address; preview links ask for a login your calendar can’t do.";
const HOW_TO_STOP =
  "To stop the haunting, remove the subscription from your calendar app; nothing is stored about you.";
const RESPECT = "Only people who died at least 25 years ago are included.";

type FeedState = { status: "ok"; feed: PreviewFeed } | { status: "error"; message: string };

function subscribeNothing() {
  return () => {};
}
const getOrigin = () => window.location.origin;
const getHost = () => window.location.host;
const getToday = () => ymdKey(localToday());

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function parseKey(key: string): YMD {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function dateLabel(date: YMD, today: YMD): string {
  if (date.y === today.y && date.m === today.m && date.d === today.d) return "Today";
  return new Date(date.y, date.m - 1, date.d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.y !== today.y ? { year: "numeric" } : {}),
  });
}

/** The parts of an almanac date block, in the phone's language. */
function dateParts(date: YMD, today: YMD) {
  const d = new Date(date.y, date.m - 1, date.d);
  const isToday = date.y === today.y && date.m === today.m && date.d === today.d;
  return {
    month: d.toLocaleDateString(undefined, { month: "short" }),
    day: date.d,
    weekday: isToday ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" }),
    year: date.y !== today.y ? String(date.y) : null,
    isToday,
  };
}

/** Which of eight moon phases a local date falls in (0 new … 4 full), from a known new moon (6 Jan 2000, 18:14 UTC). */
export function moonPhaseIndex(date: YMD): number {
  const SYNODIC = 29.530588853;
  const days = (Date.UTC(date.y, date.m - 1, date.d, 12) - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  return Math.round((age / SYNODIC) * 8) % 8;
}

/** The lit part of phase i of 8 as a path, for a moon of radius r at (cx, cy). */
function litPath(i: number, cx: number, cy: number, r: number): string | null {
  if (i === 0) return null;
  if (i === 4) return `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}Z`;
  const k = Math.cos((i / 8) * 2 * Math.PI);
  const rx = Math.abs(k) * r;
  const waxing = i < 4;
  const crescent = k > 0;
  const outer = waxing ? 1 : 0;
  const inner = waxing === crescent ? 0 : 1;
  return `M${cx} ${cy - r}A${r} ${r} 0 0 ${outer} ${cx} ${cy + r}A${rx.toFixed(2)} ${r} 0 0 ${inner} ${cx} ${cy - r}Z`;
}

/** Eight moon phases across the top of the almanac page; tonight's is lit in candle. Decorative. */
function MoonPhases({ tonight }: { tonight: number | null }) {
  return (
    <svg viewBox="0 0 200 24" className="almanac-phases" aria-hidden="true" focusable="false">
      {Array.from({ length: 8 }, (_, i) => {
        const cx = 12.5 + i * 25;
        const lit = litPath(i, cx, 12, 7.5);
        return (
          <g key={i} className={i === tonight ? "almanac-tonight" : undefined}>
            <circle cx={cx} cy={12} r={7.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
            {lit && <path d={lit} fill="currentColor" opacity={i === tonight ? 0.9 : 0.45} />}
            {i === tonight && (
              <circle cx={cx} cy={12} r={10.5} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.6} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

type Platform = "apple" | "google" | "outlook";

/** The calendar this phone most likely uses, for the one filled button. */
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return "apple";
  if (/Windows/.test(ua)) return "outlook";
  return "google";
}

/** The story link inside the app, whatever host the feed's absolute URL names. */
function appPath(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.pathname}${u.hash}`;
  } catch {
    return null;
  }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: { message?: unknown } };
    if (typeof json.error?.message === "string") return json.error.message;
  } catch {
    // not JSON
  }
  return `The server answered ${res.status}.`;
}

export function CalendarSubscribeFallback() {
  return (
    <p className="card p-4 text-muted" role="status">
      Loading the calendars…
    </p>
  );
}

/** An empty almanac entry, the same size as a real one, while the preview loads. */
function EntrySlot() {
  return (
    <li className="almanac-entry" aria-hidden="true">
      <span className="almanac-date">
        <span className="almanac-bar my-1 w-8" />
        <span className="almanac-bar my-2 w-7" style={{ height: "1.5rem" }} />
        <span className="almanac-bar my-1 w-8" />
      </span>
      <span className="space-y-2 pt-1">
        <span className="almanac-bar w-11/12" />
        <span className="almanac-bar w-2/3" />
      </span>
    </li>
  );
}

export function CalendarSubscribe({ samples, productionHost }: { samples: CalendarSample[]; productionHost: string }) {
  const params = useSearchParams();
  // A calendar link's ?cemetery= wins; otherwise the haunt (decision 18e).
  const haunt = useHaunt();
  const fromLink = params.get("cemetery");
  const linkValid = fromLink !== null && QID_RE.test(fromLink);
  const preselect = linkValid ? fromLink : (haunt?.qid ?? fromLink);
  const extraName = linkValid ? params.get("name") : (haunt?.name ?? null);
  const extraPlace = linkValid ? params.get("place") : (haunt?.place ?? null);
  const extra = useMemo(
    () =>
      preselect && QID_RE.test(preselect) && !samples.some((s) => s.qid === preselect)
        ? fromTourPage(preselect, extraName, extraPlace)
        : null,
    [preselect, extraName, extraPlace, samples],
  );
  const options = useMemo(() => (extra ? [extra, ...samples] : samples), [extra, samples]);
  const [qid, setQid] = useState(() =>
    preselect && options.some((s) => s.qid === preselect) ? preselect : samples[0].qid,
  );
  const [birthdays, setBirthdays] = useState(false);
  const [feeds, setFeeds] = useState<Record<string, FeedState>>({});
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const loaded = useRef(new Set<string>());

  const origin = useSyncExternalStore(subscribeNothing, getOrigin, () => "");
  const host = useSyncExternalStore(subscribeNothing, getHost, () => "");
  const todayKey = useSyncExternalStore(subscribeNothing, getToday, () => "");
  const platform = useSyncExternalStore<Platform | null>(subscribeNothing, detectPlatform, () => null);

  const sample = options.find((s) => s.qid === qid) ?? samples[0];
  const kinds: EventKind[] = birthdays ? ["death", "birth"] : ["death"];
  const path = feedPath(sample.qid, { kinds });
  const links = origin ? subscribeLinks(origin, path, sample.calendarName) : null;
  const state = feeds[path];

  // Fetch the same feed a calendar app would get, and preview it.
  useEffect(() => {
    if (loaded.current.has(path)) return;
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    (async (): Promise<FeedState> => {
      try {
        const res = await fetch(path, { signal: ctrl.signal, headers: { accept: "text/calendar" } });
        if (!res.ok) return { status: "error", message: await errorMessage(res) };
        return { status: "ok", feed: readFeed(await res.text()) };
      } catch {
        return {
          status: "error",
          message: `No answer within ${FETCH_TIMEOUT_MS / 1000} seconds. You may be offline.`,
        };
      } finally {
        clearTimeout(timer);
      }
    })().then((result) => {
      if (cancelled) return;
      if (result.status === "ok") loaded.current.add(path);
      setFeeds((prev) => ({ ...prev, [path]: result }));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [path]);

  function choose(next: string) {
    setQid(next);
    setCopyNote(null);
    try {
      const q = new URLSearchParams({ cemetery: next });
      if (extra && next === extra.qid) {
        q.set("name", extra.name);
        if (extra.place) q.set("place", extra.place);
      }
      window.history.replaceState(null, "", `?${q}`);
    } catch {
      // Only the address bar misses out.
    }
  }

  async function copy() {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.feed);
      setCopyNote("Address copied. Paste it into your calendar app’s “subscribe” or “from URL” option.");
    } catch {
      setCopyNote("Couldn’t copy. Press and hold the address above to copy it.");
    }
  }

  const feed = state?.status === "ok" ? state.feed : null;
  const deaths = feed?.events.filter((e) => e.kind === "death").length ?? 0;
  const births = feed?.events.filter((e) => e.kind === "birth").length ?? 0;
  const today = todayKey ? parseKey(todayKey) : null;
  const next = feed && today ? upcoming(feed.events, today, PREVIEW_COUNT) : [];

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-bold">Cemetery</legend>
        {options.map((s) => (
          <label
            key={s.qid}
            className={`tap flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
              s.qid === sample.qid ? "border-accent bg-surface-2" : "border-border bg-surface"
            }`}
          >
            <input
              type="radio"
              name="cemetery"
              value={s.qid}
              checked={s.qid === sample.qid}
              onChange={() => choose(s.qid)}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              <span className="font-display text-xl">{s.name}</span>
              <span className="block text-sm text-muted">{s.place}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="tap flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <input
          type="checkbox"
          role="switch"
          checked={birthdays}
          onChange={(e) => setBirthdays(e.currentTarget.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="font-bold">Add birthdays too</span>
      </label>

      <section aria-labelledby="preview-heading" className="almanac-page space-y-3">
        <MoonPhases tonight={today ? moonPhaseIndex(today) : null} />
        <h2 id="preview-heading" className="text-center font-display text-2xl">
          What you&rsquo;ll get
        </h2>
        <p className="readout almanac-count" aria-hidden="true">
          {feed
            ? `${plural(deaths, "death-day", "death-days")}${birthdays ? ` · ${plural(births, "birthday", "birthdays")}` : ""} a year`
            : state?.status === "error"
              ? "No signal"
              : "Loading"}
        </p>
        {!state && (
          <>
            <p role="status" className="almanac-summary text-muted">
              Loading the calendar…
            </p>
            <h3 className="font-bold">Coming up</h3>
            <ol className="almanac-entries">
              {Array.from({ length: PREVIEW_COUNT }, (_, i) => (
                <EntrySlot key={i} />
              ))}
            </ol>
          </>
        )}
        {state?.status === "error" && (
          <p role="alert" className="text-danger">
            Couldn&rsquo;t load the preview: {state.message} The buttons below still work once you&rsquo;re online.
          </p>
        )}
        {feed && (
          <>
            <p data-testid="calendar-summary" className="almanac-summary text-lg">
              {deaths + births === 0
                ? `No one buried at ${sample.label} died long enough ago to be included yet.`
                : `${plural(deaths, "death-day", "death-days")}${
                    birthdays ? ` and ${plural(births, "birthday", "birthdays")}` : ""
                  } from ${sample.label}, every year`}
            </p>
            {next.length > 0 && today && (
              <>
                <h3 className="font-bold">Coming up</h3>
                <ol className="almanac-entries" data-testid="preview-list">
                  {next.map(({ event, date }) => {
                    const href = appPath(event.url);
                    const parts = dateParts(date, today);
                    return (
                      <li
                        key={event.uid}
                        data-testid="preview-event"
                        data-date={ymdKey(date)}
                        data-uid={event.uid}
                        className={`almanac-entry ${parts.isToday ? "almanac-today" : ""}`}
                      >
                        <time dateTime={ymdKey(date)} className="almanac-date">
                          <span className="sr-only">{dateLabel(date, today)}</span>
                          <span aria-hidden="true" className="label">
                            {parts.month}
                          </span>
                          <span aria-hidden="true" className="almanac-day">
                            {parts.day}
                          </span>
                          <span aria-hidden="true" className="label">
                            {parts.weekday}
                          </span>
                          {parts.year && (
                            <span aria-hidden="true" className="text-sm">
                              {parts.year}
                            </span>
                          )}
                        </time>
                        <span>
                          <span className="block">
                            {event.kind === "birth" ? (
                              <Sprout className="almanac-kind almanac-birth" />
                            ) : (
                              <Moth className="almanac-kind almanac-death" />
                            )}
                            {event.summary}
                          </span>
                          {href && (
                            <Link
                              href={href}
                              className="tap inline-flex items-center text-sm underline underline-offset-4"
                            >
                              Read their story
                            </Link>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </>
        )}
        <p className="text-sm text-muted">{RESPECT}</p>
      </section>

      <section aria-labelledby="subscribe-heading" className="space-y-3">
        <h2 id="subscribe-heading" className="font-display text-2xl">
          Subscribe
        </h2>
        {links ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* One filled button, for the calendar this phone most likely uses; the others are outlined. */}
            {order(platform).map((p) => (
              <a
                key={p}
                href={links[p]}
                {...(p === "apple" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                className={`btn ${p === (platform ?? "google") ? "btn-primary btn-lg sm:col-span-2" : "btn-ghost"}`}
                data-primary={p === (platform ?? "google") ? "true" : undefined}
              >
                {SUBSCRIBE_LABEL[p]}
              </a>
            ))}
            <a href={path} download={`${sample.slug}.ics`} className="btn btn-ghost">
              Download .ics
            </a>
          </div>
        ) : (
          <p role="status" className="text-muted">
            Preparing the links…
          </p>
        )}
        <p className="text-sm text-muted">
          Download .ics adds the events once, with no updates. To remove those later, delete them, or the calendar you
          imported them into.
        </p>

        {links && (
          <div className="space-y-2">
            <label className="block">
              <span className="text-sm text-muted">Feed address, for any other calendar app</span>
              <input
                readOnly
                value={links.feed}
                onFocus={(e) => e.currentTarget.select()}
                data-testid="feed-url"
                className="field mt-1 w-full font-mono text-sm"
              />
            </label>
            <button type="button" onClick={copy} className="btn btn-ghost">
              Copy address
            </button>
            {copyNote && (
              <p role="status" className="text-sm">
                {copyNote}
              </p>
            )}
          </div>
        )}

        {host && host !== productionHost && (
          <p data-testid="not-public" className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
            {NOT_PUBLIC}
          </p>
        )}
        <p className="text-sm text-muted">{HOW_TO_STOP}</p>
      </section>
    </div>
  );
}
