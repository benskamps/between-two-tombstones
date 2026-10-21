"use client";

const KEY = "btt-etiquette-seen";

/**
 * The first-run rules (decision 5), as a quiet card at the top of the first
 * cemetery hub instead of a popup (Ben, F6). Rendered on the server; the
 * layout's early script marks <html data-etq="seen"> once they've been read,
 * and CSS hides the card before paint. "Got it" remembers it.
 */
export function EtiquetteNotice() {
  function gotIt() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Storage blocked: it stays hidden for this page view only.
    }
    document.documentElement.setAttribute("data-etq", "seen");
  }

  return (
    <aside aria-labelledby="etq-title" className="etq-notice card space-y-1 px-4 py-3" data-testid="etiquette">
      <p id="etq-title" className="font-bold">
        Before you go in: stay on the paths, give mourners space, no real rubbings.
      </p>
      <div className="flex flex-wrap items-start justify-between gap-x-3">
        <details className="min-w-0 flex-1">
          <summary className="tap flex cursor-pointer items-center text-mauve underline underline-offset-4">Read the four rules</summary>
          <ul className="mt-1 list-disc space-y-1 pb-2 pl-5">
            <li>Don&rsquo;t take real rubbings. They wear stones down. Use the Stamp Kit with a photo instead.</li>
            <li>Stay on paths and don&rsquo;t lean on or climb stones.</li>
            <li>Give mourners and funerals space. Put the spirit box away near them.</li>
            <li>Check the closing time. Many cemeteries lock their gates at dusk.</li>
          </ul>
        </details>
        <button type="button" onClick={gotIt} className="btn btn-ghost">
          Got it
        </button>
      </div>
    </aside>
  );
}
