"use client"; // Error boundaries must be Client Components.

// Only when the root layout itself fails. It replaces the layout, so it brings
// its own <html>, <body> and styles (Next 16 docs: global-error renders its own
// document without the app's global styles). The layout's fonts aren't loaded
// here, so the font tokens fall back to system faces; colours and primitives
// come from globals.css. Dark only (decision 18).

import "./globals.css";
import type { CSSProperties } from "react";
import ErrorPage from "./error";

const SYSTEM_FONTS = {
  "--font-body": "system-ui, sans-serif",
  "--font-carved": "Georgia, serif",
  "--font-space": "system-ui, sans-serif",
} as CSSProperties;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased" style={{ ...SYSTEM_FONTS, colorScheme: "dark" }}>
      <body className="flex min-h-full flex-col">
        <title>This page didn’t load · Between Two Tombstones</title>
        <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pb-6 pt-8">
          <ErrorPage error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
