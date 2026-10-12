"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ViewMode = "grid" | "list";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * localStorage is read as an external store rather than through an effect, so
 * the stored choice does not arrive via a second render pass.
 */
export function useViewMode(
  storageKey: string,
  fallback: ViewMode = "grid",
): [ViewMode, (mode: ViewMode) => void] {
  const view = useSyncExternalStore<ViewMode>(
    subscribe,
    () => {
      const stored = window.localStorage.getItem(storageKey);
      return stored === "list" || stored === "grid" ? stored : fallback;
    },
    () => fallback,
  );

  const change = useCallback(
    (mode: ViewMode) => {
      window.localStorage.setItem(storageKey, mode);
      for (const notify of listeners) notify();
    },
    [storageKey],
  );

  return [view, change];
}
