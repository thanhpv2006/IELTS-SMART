"use client";

import { useEffect } from "react";

/**
 * Refcounted media (audio/video) pause coordinator shared by every "exam is obscured" source —
 * the fullscreen resume-gate (owned by `ExamSkillRunner`) and the leave-tab gate (owned by the
 * take/mock pages). Two independent owners act on the SAME `<audio>`/`<video>` elements, so a
 * naive per-owner pause/resume would fight over "which element did I pause". This module keeps a
 * single source of truth: media pauses when the FIRST source obscures and only resumes once the
 * LAST source reveals.
 *
 * Pause never resets `currentTime`, so `reveal` resumes playback from exactly where it stopped
 * (design D2/GC3 — "tự play tiếp từ chỗ dừng"). App-side only; the exam engine is untouched.
 */
/**
 * The obscure sources. A closed union (not `string`) so a typo'd key is a compile error rather
 * than a silent leak — a mismatched key would never `reveal`, pinning `sources.size > 0` and
 * leaving audio paused for the rest of the session.
 */
type ObscureSource = "fullscreen" | "tab";

const sources = new Set<ObscureSource>();
let paused: HTMLMediaElement[] = [];

/** Register an obscure source; pause all currently-playing media on the first one. */
export function obscure(source: ObscureSource): void {
  if (typeof document === "undefined") return;
  if (sources.size === 0) {
    paused = Array.from(
      document.querySelectorAll<HTMLMediaElement>("audio, video"),
    ).filter((el) => !el.paused);
    for (const el of paused) el.pause();
  }
  sources.add(source);
}

/** Deregister an obscure source; resume the paused media once no source remains. */
export function reveal(source: ObscureSource): void {
  if (typeof document === "undefined") return;
  sources.delete(source);
  if (sources.size === 0) {
    for (const el of paused) {
      // Skip elements torn out of the DOM (e.g. runner unmounted on terminate) and swallow the
      // play() rejection — resuming audio must never throw into React.
      if (el.isConnected) void el.play()?.catch(() => {});
    }
    paused = [];
  }
}

/**
 * Effect wrapper: while `active`, this component/hook counts as an obscure source; on cleanup (or
 * when `active` flips false) it reveals. Both `ExamSkillRunner` (source `"fullscreen"`) and the
 * take/mock pages (source `"tab"`) use this to drive the shared coordinator above.
 */
export function useObscureMedia(active: boolean, source: ObscureSource): void {
  useEffect(() => {
    if (!active) return;
    obscure(source);
    return () => reveal(source);
  }, [active, source]);
}
