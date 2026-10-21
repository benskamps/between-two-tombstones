"use client";

import { useState } from "react";
import { useOnline } from "@/components/offline/hooks";
import { CARD_PHOTO_WIDTH, commonsFilePage, commonsThumb, SMALL_PHOTO_WIDTH } from "@/lib/tour/links";

/**
 * A card photo from Commons: the grave, or (when the grave photo on Wikidata
 * shows some other cemetery) their portrait, labeled as such. If it can't
 * load, the card still reads and says why.
 */
export function GravePhoto({
  src,
  name,
  kind = "grave",
  priority = false,
}: {
  src: string;
  name: string;
  kind?: "grave" | "portrait";
  /** Stop 1's photo is on the first screen and often the LCP element: load it eagerly, first. */
  priority?: boolean;
}) {
  const online = useOnline();
  const [failed, setFailed] = useState(false);
  const width = kind === "grave" ? CARD_PHOTO_WIDTH : SMALL_PHOTO_WIDTH;
  const thumb = commonsThumb(src, width);
  const filePage = commonsFilePage(src);
  if (!thumb) return null;

  if (failed || !online) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
        {online ? "The photo couldn't load." : "Photo not saved for offline."}
      </p>
    );
  }

  return (
    // A portrait is centered with its caption under it, so the card has no dead half beside a small
    // thumbnail (REVIEW-2 N9). Same on plain cards: it's layout, not ornament.
    <figure className={kind === "grave" ? "space-y-1" : "flex flex-col items-center gap-1 text-center"}>
      {/* Commons serves the scaled copy at a standard width; next/image would add nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb}
        alt={kind === "grave" ? `Grave of ${name}` : `Portrait of ${name}`}
        width={width}
        height={kind === "grave" ? Math.round(width * 0.75) : Math.round(width * 1.25)}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={
          kind === "grave"
            ? "h-auto max-h-80 w-full rounded-lg bg-surface-2 object-cover"
            : "h-auto max-h-56 w-40 rounded-lg bg-surface-2 object-cover object-top"
        }
      />
      <figcaption className="text-xs text-muted">
        {kind === "portrait" && <span className="block text-sm font-bold text-text">Portrait</span>}
        {filePage && (
          <>
            Photo:{" "}
            <a href={filePage} className="underline" target="_blank" rel="noopener noreferrer">
              Wikimedia Commons
            </a>{" "}
            (author and license on the file page)
          </>
        )}
      </figcaption>
    </figure>
  );
}
