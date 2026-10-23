"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useActiveCemetery } from "@/lib/haunt/useHaunt";
import { shareEvent } from "@/lib/share/analytics";
import { isShareQid, sharePath } from "@/lib/share/links";
import { ageFromDates, datesLine } from "@/lib/stamp/age";
import { recordStampMade } from "@/lib/passport/store";
import { defaultQuad, isUsableQuad } from "@/lib/stamp/homography";
import {
  DEFAULT_SETTINGS,
  GRIT_MAX,
  STROKE_MAX,
  STROKE_MIN,
  type CarveMode,
  type Quad,
  type StampSettings,
  type StampText,
} from "@/lib/stamp/types";
import { ReadoutStrip } from "@/components/ui/Instrument";
import { StepHeading } from "@/components/ui/Motifs";
import { CornerFramer } from "./CornerFramer";
import { ReadWithClaude } from "./ReadWithClaude";
import { EmptySpecimens, RENDER_LABELS, StampPreviews, type PreviewUrls } from "./StampPreviews";
import { StampClient, stampKitSupported, type RenderResult } from "./stampClient";

/** Photos are downsized to this long side on the phone before anything else happens. */
const MAX_WORK_SIDE = 2000;
const DEBOUNCE_MS = 250;

const MODES: { value: CarveMode; label: string; hint: string }[] = [
  { value: "dark", label: "Dark letters", hint: "Carving in shadow, darker than the stone" },
  { value: "light", label: "Light letters", hint: "Carving lit up or painted, lighter than the stone" },
  { value: "edges", label: "Both edges", hint: "Worn stones: pick up both sides of each cut" },
];

type Photo = { bitmap: ImageBitmap; width: number; height: number };
type Blobs = { rubbing: Blob; ink: Blob; postage: Blob };

function slug(s: string): string {
  const out = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return out || "headstone";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * The link that goes out with the stamps: the stop's share page when the
 * address names a person at its cemetery (?cemetery=Q…&person=Q…), else the
 * tour of the cemetery in use (the haunt). The images themselves go as files,
 * straight from the phone (decision 4); the link carries only IDs.
 */
function useStampLink(): string | null {
  const params = useSearchParams();
  const cemetery = useActiveCemetery();
  if (!cemetery) return null;
  const person = params.get("person");
  if (cemetery.fromUrl && isShareQid(person)) return sharePath({ kind: "stop", cemetery: cemetery.qid, person });
  return sharePath({ kind: "tour", cemetery: cemetery.qid });
}

export function StampKit() {
  const clientRef = useRef<StampClient | null>(null);
  const urlsRef = useRef<PreviewUrls | null>(null);
  const blobsRef = useRef<Blobs | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [opening, setOpening] = useState(false);
  const [corners, setCorners] = useState<Quad | null>(null);
  const [settings, setSettings] = useState<StampSettings>(DEFAULT_SETTINGS);
  const [name, setName] = useState("");
  const [born, setBorn] = useState("");
  const [died, setDied] = useState("");
  const [ageInput, setAgeInput] = useState("");
  const [ageTouched, setAgeTouched] = useState(false);
  const [urls, setUrls] = useState<PreviewUrls | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ ms: number; maskPixels: number; job: number; timings: string } | null>(null);
  const [mainThread, setMainThread] = useState(false);
  /** Shown when the files couldn't go out: the link to copy by hand. */
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const linkPath = useStampLink();

  // Tear down the worker and blob URLs when leaving the page.
  useEffect(() => {
    const client = clientRef;
    const u = urlsRef;
    return () => {
      client.current?.terminate();
      client.current = null;
      if (u.current) Object.values(u.current).forEach((x) => URL.revokeObjectURL(x));
    };
  }, []);

  const autoAge = ageFromDates(born, died);
  const ageValue = ageTouched ? ageInput : autoAge !== null ? String(autoAge) : "";
  const age = useMemo(() => {
    const n = Number.parseInt(ageValue, 10);
    return Number.isFinite(n) && n >= 0 && n <= 150 ? n : null;
  }, [ageValue]);
  const text: StampText = useMemo(() => ({ name, born, died, age }), [name, born, died, age]);
  const fileStem = slug(name);
  const cornersOk = corners !== null && isUsableQuad(corners);

  const applyRender = useCallback((r: RenderResult) => {
    const next: PreviewUrls = {
      rubbing: URL.createObjectURL(r.rubbing),
      ink: URL.createObjectURL(r.ink),
      postage: URL.createObjectURL(r.postage),
    };
    const prev = urlsRef.current;
    urlsRef.current = next;
    blobsRef.current = { rubbing: r.rubbing, ink: r.ink, postage: r.postage };
    if (!prev && r.stats.maskPixels > 0) recordStampMade();
    setUrls(next);
    const timings = Object.fromEntries(Object.entries(r.timings).map(([k, v]) => [k, Math.round(v)]));
    setLast({
      ms: Math.round(r.timings.total),
      maskPixels: r.stats.maskPixels,
      job: r.job,
      timings: JSON.stringify(timings),
    });
    if (prev) setTimeout(() => Object.values(prev).forEach((x) => URL.revokeObjectURL(x)), 1000);
  }, []);

  // Live previews: debounced; a newer job cancels the one in flight (in the worker) and its result is ignored here.
  useEffect(() => {
    const client = clientRef.current;
    if (!photo || !corners || !cornersOk || !client) return;
    let stale = false;
    const timer = setTimeout(
      async () => {
        setBusy(true);
        setError(null);
        setStatus("Making your stamps…");
        try {
          const r = await client.render(corners, settings, text);
          if (stale || !r) return;
          applyRender(r);
          setBusy(false);
          const secs = (r.timings.total / 1000).toFixed(1);
          setStatus(
            r.stats.maskPixels > 0
              ? `Stamps ready in ${secs} s.`
              : `Stamps ready in ${secs} s, but no carving was found. Try “Light letters” or “Both edges”, lower the grit, or tighten the corners.`,
          );
        } catch (err) {
          if (stale) return;
          setBusy(false);
          setError(err instanceof Error ? err.message : "Couldn't make the stamps.");
        }
        // The first render for a photo goes straight away; later ones wait for a pause in dragging or typing.
      },
      urlsRef.current ? DEBOUNCE_MS : 0,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [photo, corners, cornersOk, settings, text, applyRender]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!stampKitSupported()) {
      setError("This browser can't make stamps: it lacks off-screen drawing. Try a current Chrome, Firefox or Safari.");
      return;
    }
    setOpening(true);
    setError(null);
    setStatus("Opening your photo…");
    try {
      const full = await createImageBitmap(file, { imageOrientation: "from-image" });
      let work = full;
      const s = MAX_WORK_SIDE / Math.max(full.width, full.height);
      if (s < 1) {
        work = await createImageBitmap(full, {
          resizeWidth: Math.round(full.width * s),
          resizeHeight: Math.round(full.height * s),
          resizeQuality: "high",
        });
        full.close();
      }
      const forWorker = await createImageBitmap(work);
      clientRef.current ??= new StampClient();
      setMainThread(clientRef.current.mode === "main");
      await clientRef.current.load(forWorker);
      setPhoto((old) => {
        old?.bitmap.close();
        return { bitmap: work, width: work.width, height: work.height };
      });
      setCorners(defaultQuad(work.width, work.height));
      setUrls(null);
      setLast(null);
      blobsRef.current = null;
      setStatus("Photo ready. Drag the corners onto the stone's face; the stamps update as you go.");
    } catch (err) {
      setStatus("");
      setError(
        err instanceof Error && err.message.startsWith("The Stamp Kit")
          ? err.message
          : "Couldn't open that photo. Try another one, or a JPEG or PNG.",
      );
    } finally {
      setOpening(false);
    }
  }

  async function saveKit(kind: "sheet" | "story") {
    const client = clientRef.current;
    if (!client) return;
    setSaving(true);
    try {
      const { sheet, story } = await client.kit(text);
      download(kind === "sheet" ? sheet : story, `${fileStem}-${kind === "sheet" ? "kit-sheet" : "story"}.png`);
      setStatus(kind === "sheet" ? "Kit sheet saved." : "Story-size image saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the kit sheet.");
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    const client = clientRef.current;
    const blobs = blobsRef.current;
    if (!client || !blobs) return;
    setSaving(true);
    setFallbackLink(null);
    const who = name.trim();
    const shareText = who
      ? `A rubbing and stamps of ${who}'s headstone${datesLine(born, died) ? ` (${datesLine(born, died)})` : ""}, made from a photo with Between Two Tombstones. No stone was touched.`
      : "A rubbing and stamps made from a headstone photo with Between Two Tombstones. No stone was touched.";
    const url = linkPath ? new URL(linkPath, window.location.origin).toString() : null;
    try {
      const { sheet } = await client.kit(text);
      const files = [
        new File([sheet], `${fileStem}-kit-sheet.png`, { type: "image/png" }),
        new File([blobs.rubbing], `${fileStem}-${RENDER_LABELS.rubbing.file}.png`, { type: "image/png" }),
        new File([blobs.ink], `${fileStem}-${RENDER_LABELS.ink.file}.png`, { type: "image/png" }),
        new File([blobs.postage], `${fileStem}-${RENDER_LABELS.postage.file}.png`, { type: "image/png" }),
      ];
      if (typeof navigator.canShare === "function" && navigator.canShare({ files })) {
        // The images as files, and the tour's link (it unfurls with its card in a chat). Where files
        // and a url can't go together, the link rides in the text instead.
        const data: ShareData = url
          ? navigator.canShare({ files, url })
            ? { files, title: "Stamp Kit", text: shareText, url }
            : { files, title: "Stamp Kit", text: `${shareText} ${url}` }
          : { files, title: "Stamp Kit", text: shareText };
        try {
          await navigator.share(data);
          shareEvent("share_created", "stamp", "files");
          setStatus("Shared.");
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            setStatus("Sharing cancelled.");
            return;
          }
          // Fall through to download + copy.
        }
      }
      // No file sharing here: save the kit sheet, and copy the link to go with it.
      download(sheet, `${fileStem}-kit-sheet.png`);
      shareEvent("share_created", "stamp", "download");
      const copy = url ?? shareText;
      try {
        await navigator.clipboard.writeText(copy);
        setStatus(
          url
            ? "This browser can't share files, so the kit sheet was saved and the link to the tour copied."
            : "This browser can't share files, so the kit sheet was saved and the caption copied.",
        );
      } catch {
        setStatus(`This browser can't share files, so the kit sheet was saved.${url ? " Copy the link below to send with it." : ` Caption: ${shareText}`}`);
      }
      if (url) setFallbackLink(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't share the stamps.");
    } finally {
      setSaving(false);
    }
  }

  const getReadImages = useCallback(async () => {
    const client = clientRef.current;
    if (!client || !corners) throw new Error("Choose a photo first.");
    return client.readImages(corners);
  }, [corners]);

  const strokeLabel = settings.stroke > 0 ? `+${settings.stroke}` : String(settings.stroke);

  return (
    <div className="space-y-6">
      <section aria-labelledby="step-photo" className="darkroom-easel bezel space-y-4">
        <StepHeading n={1} id="step-photo">
          Take or choose a photo
        </StepHeading>
        {!photo && (
          <div className="darkroom-mat">
            <EmptyStage />
          </div>
        )}
        {!photo && (
          <p className="text-muted">
            Stand square to the stone, fill the frame with its face, and avoid your own shadow. The photo stays on your
            phone.
          </p>
        )}
        <label
          htmlFor="stamp-photo"
          className={`btn w-full cursor-pointer focus-within:outline focus-within:outline-3 focus-within:outline-[var(--focus)] ${
            photo ? "btn-ghost" : "btn-primary btn-lg"
          }`}
        >
          {opening ? "Opening…" : photo ? "Use a different photo" : "Take or choose a photo"}
          <input
            id="stamp-photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            disabled={opening}
            className="sr-only"
          />
        </label>
      </section>

      {!photo && (
        <section aria-labelledby="what-you-get" className="space-y-3">
          <h2 id="what-you-get" className="font-display text-2xl">
            What your photo becomes
          </h2>
          <EmptySpecimens />
          <p className="text-muted">
            They appear here as you frame the stone. The postage stamp&rsquo;s value is the age at death.
          </p>
        </section>
      )}

      <p className="sr-only" role="status" aria-live="polite" data-testid="stamp-status">
        {status}
      </p>
      {status && (
        <p aria-hidden="true" className="rounded-lg bg-surface-2 px-3 py-2 text-[0.9375rem]">
          {status}
        </p>
      )}
      {mainThread && (
        <p className="text-sm text-muted" data-testid="main-thread-note">
          This browser can&rsquo;t make stamps in the background, so the page may pause for a moment while they&rsquo;re
          made.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-danger px-3 py-2 text-danger">
          {error}
        </p>
      )}

      {photo && corners && (
        <>
          <section aria-labelledby="step-frame" className="darkroom-easel bezel space-y-3">
            <StepHeading n={2} id="step-frame">
              Frame the stone
            </StepHeading>
            <CornerFramer bitmap={photo.bitmap} corners={corners} onChange={setCorners} matClassName="darkroom-mat" />
            {!cornersOk && (
              <p role="alert" className="text-danger">
                The corners cross over. Drag them back onto the stone&rsquo;s four corners, clockwise from top-left.
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCorners(defaultQuad(photo.width, photo.height))}
                className="btn btn-ghost px-4 text-sm"
              >
                Reset corners
              </button>
            </div>
          </section>

          <section aria-labelledby="step-lift" className="darkroom-easel bezel space-y-4">
            <StepHeading n={3} id="step-lift">
              Lift the carving
            </StepHeading>
            {/* The settings as a readout; the same facts are in the labels below. */}
            <ReadoutStrip
              testId="stamp-readouts"
              tone="candle"
              live={busy}
              status={busy ? "Developing" : last ? "Ready" : "Standby"}
              values={[{ value: settings.mode }, { label: "Grit", value: String(settings.grit) }]}
            />
            <fieldset className="space-y-2">
              <legend className="font-bold">What to lift</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {MODES.map((m) => (
                  <label
                    key={m.value}
                    className={`tap flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                      settings.mode === m.value ? "border-accent bg-surface-2" : "border-border bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="carve-mode"
                      value={m.value}
                      checked={settings.mode === m.value}
                      onChange={() => setSettings((s) => ({ ...s, mode: m.value }))}
                      className="mt-1 h-5 w-5 accent-[var(--accent)]"
                    />
                    <span>
                      <span className="block font-bold">{m.label}</span>
                      <span className="block text-sm text-muted">{m.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="grit" className="block font-bold">
                  Grit: ignore specks under {settings.grit} px
                </label>
                <input
                  id="grit"
                  type="range"
                  min={0}
                  max={GRIT_MAX}
                  step={5}
                  value={settings.grit}
                  onChange={(e) => setSettings((s) => ({ ...s, grit: Number(e.target.value) }))}
                  className="knob"
                />
              </div>
              <div>
                <label htmlFor="stroke" className="block font-bold">
                  Stroke weight: {strokeLabel}
                </label>
                <input
                  id="stroke"
                  type="range"
                  min={STROKE_MIN}
                  max={STROKE_MAX}
                  step={1}
                  value={settings.stroke}
                  aria-valuetext={
                    settings.stroke === 0
                      ? "as found"
                      : `${Math.abs(settings.stroke)} px ${settings.stroke > 0 ? "thicker" : "thinner"}`
                  }
                  onChange={(e) => setSettings((s) => ({ ...s, stroke: Number(e.target.value) }))}
                  className="knob"
                />
              </div>
            </div>
            <StampPreviews
              urls={urls}
              busy={busy}
              fileStem={fileStem}
              renderMs={last?.ms ?? null}
              maskPixels={last?.maskPixels ?? null}
              timings={last?.timings ?? ""}
              job={last?.job ?? 0}
            />
          </section>

          <section aria-labelledby="step-share" className="darkroom-easel bezel space-y-3">
            <StepHeading n={4} id="step-share">
              Add words, then save or share
            </StepHeading>
            <p className="text-muted">
              Optional. The name heads the ink stamp and the kit sheet; the age at death is the postage stamp&rsquo;s
              value.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="stamp-name" className="block font-bold">
                  Name on the stone
                </label>
                <input
                  id="stamp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  maxLength={60}
                  className="field mt-1 w-full"
                />
              </div>
              <div>
                <label htmlFor="stamp-born" className="block font-bold">
                  Born
                </label>
                <input
                  id="stamp-born"
                  value={born}
                  onChange={(e) => setBorn(e.target.value)}
                  placeholder="e.g. April 3, 1783"
                  autoComplete="off"
                  maxLength={40}
                  className="field mt-1 w-full"
                />
              </div>
              <div>
                <label htmlFor="stamp-died" className="block font-bold">
                  Died
                </label>
                <input
                  id="stamp-died"
                  value={died}
                  onChange={(e) => setDied(e.target.value)}
                  placeholder="e.g. November 28, 1859"
                  autoComplete="off"
                  maxLength={40}
                  className="field mt-1 w-full"
                />
              </div>
              <div>
                <label htmlFor="stamp-age" className="block font-bold">
                  Age at death
                </label>
                <input
                  id="stamp-age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={150}
                  value={ageValue}
                  onChange={(e) => {
                    setAgeTouched(true);
                    setAgeInput(e.target.value);
                  }}
                  aria-describedby="stamp-age-hint"
                  className="field mt-1 w-full"
                />
                <p id="stamp-age-hint" className="mt-1 text-sm text-muted">
                  {ageTouched ? "Your number." : "Filled in from the two years; change it if you know better."}
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={share} disabled={!urls || saving} className="btn btn-primary btn-lg">
                Share
              </button>
              <button
                type="button"
                onClick={() => saveKit("sheet")}
                disabled={!urls || saving}
                className="btn btn-ghost"
              >
                Save kit sheet
              </button>
              <button
                type="button"
                onClick={() => saveKit("story")}
                disabled={!urls || saving}
                className="btn btn-ghost"
              >
                Save story size
              </button>
            </div>
            {fallbackLink && (
              <label className="block">
                <span className="text-sm text-muted">Link to send with it</span>
                <input
                  readOnly
                  value={fallbackLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="field mt-1 w-full text-sm"
                  data-testid="stamp-link"
                />
              </label>
            )}
          </section>

          <section aria-labelledby="step-read" className="darkroom-easel bezel space-y-3">
            <h2 id="step-read" className="font-display text-2xl">
              Can&rsquo;t make out the words?
            </h2>
            <ReadWithClaude disabled={!cornersOk} getImages={getReadImages} />
          </section>
        </>
      )}
    </div>
  );
}

/** The empty easel: a stone drawn in dashes, with the four corner handles you'll drag onto it. */
function EmptyStage() {
  const corners = [
    [62, 34],
    [138, 34],
    [146, 126],
    [54, 126],
  ];
  return (
    <svg viewBox="0 0 200 140" className="darkroom-empty-stage" aria-hidden="true" focusable="false">
      <path
        d="M62 126V58c0-22 17-36 38-36s38 14 38 36v68Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="5 5"
      />
      <path d="M78 66h44M74 80h52M80 94h40" fill="none" stroke="currentColor" strokeWidth={1.5} opacity={0.5} />
      <polygon
        points={corners.map((c) => c.join(",")).join(" ")}
        fill="none"
        className="stroke-mauve"
        strokeWidth={1.5}
        opacity={0.8}
      />
      {corners.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={5} className="fill-mauve stroke-bg" strokeWidth={2} />
      ))}
      <path d="M40 130h120" stroke="currentColor" strokeWidth={1.5} opacity={0.5} />
    </svg>
  );
}
