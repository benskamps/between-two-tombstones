"use client";

export type PreviewUrls = { rubbing: string; ink: string; postage: string };

export const RENDER_LABELS = {
  rubbing: { title: "Rubbing", alt: "Rubbing made from your photo: dark wax with the carving left white", file: "rubbing" },
  ink: { title: "Ink stamp", alt: "Ink stamp made from the carving, in a double frame", file: "ink-stamp" },
  postage: { title: "Postage stamp", alt: "Postage stamp engraved from your photo, valued at the age at death", file: "postage-stamp" },
} as const;

type Props = {
  urls: PreviewUrls | null;
  busy: boolean;
  fileStem: string;
  renderMs: number | null;
  maskPixels: number | null;
  /** Per-stage worker timings (JSON), for diagnostics and the e2e timing test. */
  timings: string;
  job: number;
};

/** The three live renders, each with its own save link. */
export function StampPreviews({ urls, busy, fileStem, renderMs, maskPixels, timings, job }: Props) {
  return (
    <div
      data-testid="previews"
      data-job={job}
      data-render-ms={renderMs ?? ""}
      data-mask-pixels={maskPixels ?? ""}
      data-timings={timings}
      aria-busy={busy}
      className="grid gap-4 sm:grid-cols-3"
    >
      {(Object.keys(RENDER_LABELS) as (keyof PreviewUrls)[]).map((k) => (
        <figure key={k} className="rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[repeating-conic-gradient(#d9d2c3_0_25%,#ece6d9_0_50%)] bg-[length:20px_20px]">
            {urls ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: URLs from the worker; next/image can't optimise them
              <img
                src={urls[k]}
                alt={RENDER_LABELS[k].alt}
                data-render={k}
                className={`max-h-full max-w-full object-contain transition-opacity ${busy ? "opacity-60" : ""}`}
              />
            ) : (
              <span className="px-2 text-center text-sm text-[#3b3933]">{busy ? "Making…" : "Not made yet"}</span>
            )}
          </div>
          <figcaption className="mt-2 flex items-center justify-between gap-2">
            <span className="font-bold">{RENDER_LABELS[k].title}</span>
            {urls && (
              <a
                href={urls[k]}
                download={`${fileStem}-${RENDER_LABELS[k].file}.png`}
                className="tap inline-flex items-center rounded-lg border border-border px-3 text-sm font-bold"
              >
                Save<span className="sr-only"> {RENDER_LABELS[k].title.toLowerCase()}</span>
              </a>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
