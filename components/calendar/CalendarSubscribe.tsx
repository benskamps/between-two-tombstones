"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { calendarName, cemeteryLabel, cemeterySlug } from "@/lib/calendar/feed";
import type { EventKind } from "@/lib/calendar/kinds";
import { feedPath, subscribeLinks } from "@/lib/calendar/params";
import type { CalendarSample } from "@/lib/calendar/samples";
import { localToday, readFeed, upcoming, ymdKey, type PreviewFeed } from "@/lib/calendar/upcoming";
import type { YMD } from "@/lib/stonemath";

const PREVIEW_COUNT = 5;
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
const HOW_TO_STOP = "To stop the haunting, remove the subscription from your calendar app; nothing is stored about you.";
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
    <p className="rounded-xl border border-border bg-surface p-4 text-muted" role="status">
      Loading the calendars…
    </p>
  );
}

export function CalendarSubscribe({ samples, productionHost }: { samples: CalendarSample[]; productionHost: string }) {
  const params = useSearchParams();
  const preselect = params.get("cemetery");
  const extraName = params.get("name");
  const extraPlace = params.get("place");
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
            className="tap flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 has-[:checked]:border-accent"
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

      <section aria-labelledby="preview-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 id="preview-heading" className="font-display text-2xl">
          What you&rsquo;ll get
        </h2>
        {!state && (
          <p role="status" className="text-muted">
            Loading the calendar…
          </p>
        )}
        {state?.status === "error" && (
          <p role="alert" className="text-danger">
            Couldn&rsquo;t load the preview: {state.message} The buttons below still work once you&rsquo;re online.
          </p>
        )}
        {feed && (
          <>
            <p data-testid="calendar-summary" className="text-lg">
              {deaths + births === 0
                ? `No one buried at ${sample.label} died long enough ago to be included yet.`
                : `${plural(deaths, "death-day", "death-days")}${
                    birthdays ? ` and ${plural(births, "birthday", "birthdays")}` : ""
                  } from ${sample.label}, every year`}
            </p>
            {next.length > 0 && today && (
              <>
                <h3 className="font-bold">Coming up</h3>
                <ol className="space-y-2" data-testid="preview-list">
                  {next.map(({ event, date }) => {
                    const href = appPath(event.url);
                    return (
                      <li
                        key={event.uid}
                        data-testid="preview-event"
                        data-date={ymdKey(date)}
                        data-uid={event.uid}
                        className="rounded-lg border border-border bg-surface-2 p-3"
                      >
                        <time dateTime={ymdKey(date)} className="block text-sm font-bold text-accent">
                          {dateLabel(date, today)}
                        </time>
                        <span className="block">{event.summary}</span>
                        {href && (
                          <Link href={href} className="text-sm underline">
                            Read their story
                          </Link>
                        )}
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
            <a
              href={links.apple}
              className="tap flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-center font-bold text-accent-ink"
            >
              Add to Apple Calendar
            </a>
            <a
              href={links.google}
              target="_blank"
              rel="noopener noreferrer"
              className="tap flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-center font-bold text-accent-ink"
            >
              Add to Google Calendar
            </a>
            <a
              href={links.outlook}
              target="_blank"
              rel="noopener noreferrer"
              className="tap flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-center font-bold text-accent-ink"
            >
              Add to Outlook
            </a>
            <a
              href={path}
              download={`${sample.slug}.ics`}
              className="tap flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-center font-bold"
            >
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
                className="tap mt-1 w-full rounded-lg border border-border bg-bg px-3 font-mono text-sm"
              />
            </label>
            <button type="button" onClick={copy} className="tap rounded-lg border border-border px-4 font-bold">
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
