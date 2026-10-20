"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "night" | "day";
const KEY = "btt-theme";
const EVENT = "btt-theme-change";

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "night" || v === "day" ? v : null;
  } catch {
    return null;
  }
}

function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "night" || set === "day") return set;
  return matchMedia("(prefers-color-scheme: light)").matches ? "day" : "night";
}

function subscribe(onChange: () => void) {
  const mq = matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => null);

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      document.documentElement.dataset.theme = stored;
      window.dispatchEvent(new Event(EVENT));
    }
  }, []);

  function flip() {
    const next: Theme = current() === "day" ? "night" : "day";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button
      type="button"
      onClick={flip}
      className="tap rounded-lg border border-border px-3 text-sm"
      aria-label={theme === "day" ? "Switch to dark theme" : "Switch to daylight theme"}
    >
      {theme === "day" ? "Dark" : "Daylight"}
    </button>
  );
}
