"use client";

import { useEffect, useRef } from "react";

const KEY = "btt-etiquette-seen";

/** First-run etiquette card. Shown once per browser; closes with a button or Esc. */
export function EtiquetteCard() {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      // Storage blocked: show it, it's short.
    }
    if (!seen) ref.current?.showModal();
  }, []);

  function close() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Ignore; worst case the card shows again next visit.
    }
    ref.current?.close();
  }

  return (
    <dialog
      ref={ref}
      onCancel={close}
      aria-labelledby="etiquette-title"
      className="m-auto max-w-md rounded-xl border border-border bg-surface p-5 text-text backdrop:bg-black/70"
    >
      <h2 id="etiquette-title" className="font-display text-2xl">
        Before you go in
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Don&rsquo;t take real rubbings. They wear stones down. Use the Stamp Kit with a photo instead.</li>
        <li>Stay on paths and don&rsquo;t lean on or climb stones.</li>
        <li>Give mourners and funerals space. Put the spirit box away near them.</li>
        <li>Check the closing time. Many cemeteries lock their gates at dusk.</li>
      </ul>
      <button
        type="button"
        onClick={close}
        className="tap mt-5 w-full rounded-lg bg-accent px-4 font-bold text-accent-ink"
      >
        Got it
      </button>
    </dialog>
  );
}
