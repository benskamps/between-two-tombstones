"use client";

import type { ReactNode } from "react";
import { Specimen } from "@/components/ui/Motifs";

export type PreviewUrls = { rubbing: string; ink: string; postage: string };

export const RENDER_LABELS = {
  rubbing: {
    title: "Rubbing",
    alt: "Rubbing made from your photo: dark wax with the carving left white",
    file: "rubbing",
  },
  ink: { title: "Ink stamp", alt: "Ink stamp made from the carving, in a double frame", file: "ink-stamp" },
  postage: {
    title: "Postage stamp",
    alt: "Postage stamp engraved from your photo, valued at the age at death",
    file: "postage-stamp",
  },
} as const;

const KINDS = Object.keys(RENDER_LABELS) as (keyof PreviewUrls)[];

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

/** One output pinned up as a specimen card: a paper window, its name, its save link. */
function Output({ children, action, kind }: { kind: keyof PreviewUrls; children: ReactNode; action?: ReactNode }) {
  return (
    <Specimen
      paper
      tag={
        <>
          <span className="label">{RENDER_LABELS[kind].title}</span>
          {action}
        </>
      }
    >
      {children}
    </Specimen>
  );
}

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
      // The three side by side, one frame for the camera (REVIEW-3).
      className="specimen-tray specimen-tray-compact"
    >
      {KINDS.map((k) => (
        <Output
          key={k}
          kind={k}
          action={
            urls && (
              <a
                href={urls[k]}
                download={`${fileStem}-${RENDER_LABELS[k].file}.png`}
                className="btn btn-ghost w-full px-3 text-sm"
              >
                Save<span className="sr-only"> {RENDER_LABELS[k].title.toLowerCase()}</span>
              </a>
            )
          }
        >
          {urls ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: URLs from the worker; next/image can't optimise them
            <img
              src={urls[k]}
              alt={RENDER_LABELS[k].alt}
              data-render={k}
              className={`max-h-full max-w-full object-contain transition-opacity ${busy ? "opacity-60" : ""}`}
            />
          ) : (
            <span className="specimen-empty">{busy ? "Making…" : "Not made yet"}</span>
          )}
        </Output>
      ))}
    </div>
  );
}

/** Line drawings of what each output will look like, for the empty board before a photo. */
const PLACEHOLDER: Record<keyof PreviewUrls, ReactNode> = {
  rubbing: (
    <>
      <path d="M6 21V9.5a6 6 0 0 1 12 0V21Z" />
      <path d="M9 11h6M8.5 14h7M9.5 17h5" opacity=".7" />
    </>
  ),
  ink: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1" />
      <rect x="5.5" y="7" width="13" height="10" rx=".5" />
      <path d="M8 10.5h8M9 13.5h6" opacity=".7" />
    </>
  ),
  postage: (
    <>
      <path d="M5 3.5h14v17H5Z" strokeDasharray="1.2 1.4" />
      <path d="M7.5 6h9v9.5h-9Z" />
      <path d="M9.5 15.5v-3.2a2.5 2.5 0 0 1 5 0v3.2" opacity=".7" />
      <path d="M8 18.4h3" opacity=".7" />
    </>
  ),
};

/** Before a photo: the three empty specimen cards, so the page shows what the photo becomes. */
export function EmptySpecimens() {
  return (
    <div className="specimen-tray specimen-tray-compact">
      {KINDS.map((k) => (
        <Output key={k} kind={k}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className="specimen-art"
          >
            {PLACEHOLDER[k]}
          </svg>
        </Output>
      ))}
    </div>
  );
}
