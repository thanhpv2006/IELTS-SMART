"use client";

import { useEffect, useRef, useState } from "react";

type FullscreenPhase = "start-gate" | "resume-gate" | "ready";

function readIsFullscreen(): boolean {
  return typeof document !== "undefined" && !!document.fullscreenElement;
}

// Some browsers (notably iOS Safari) do not implement the element Fullscreen API at all —
// `document.documentElement.requestFullscreen` is `undefined` there. Calling it would throw a
// synchronous TypeError that a `.catch()` on the returned promise cannot capture, so guard on it.
function fullscreenSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.documentElement.requestFullscreen === "function"
  );
}

/**
 * App-side fullscreen lockdown for the per-center `fullscreen` exam policy (design D1/GC5 — the
 * exam engine itself knows nothing about fullscreen). Not enabled ({@link enabled} false) always
 * resolves to `"ready"`, so callers can pass this through unconditionally without behavior change.
 *
 * Fullscreen state is seeded from `document.fullscreenElement` rather than always `false` so a
 * mock full-test's per-skill `<ExamSkillRunner key={skill}>` remount does not re-gate a student
 * who is already fullscreen from the previous skill (design "Mock remount per skill").
 */
export function useExamFullscreen(
  enabled: boolean,
  onExit: () => void,
): { phase: FullscreenPhase; requestFullscreen: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(readIsFullscreen);
  const hasEnteredOnceRef = useRef(isFullscreen);
  const wasFullscreenRef = useRef(isFullscreen);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const requestFullscreen = () => {
    if (!fullscreenSupported()) {
      // No element Fullscreen API (e.g. iOS Safari) — degrade safe (design GC7): let the student
      // take the exam WITHOUT fullscreen instead of hard-blocking. Marking entered + fullscreen
      // resolves `phase` to "ready" so the runner mounts. Defensive: `phase` below already
      // short-circuits to "ready" on unsupported browsers, so the gate normally isn't even shown.
      hasEnteredOnceRef.current = true;
      setIsFullscreen(true);
      return;
    }
    document.documentElement
      .requestFullscreen()
      .then(() => {
        hasEnteredOnceRef.current = true;
      })
      // Browser rejected the request (e.g. not a user gesture, or the user denied) — never crash,
      // stay on the gate and let the student retry (design GC7).
      .catch(() => {});
  };

  useEffect(() => {
    if (typeof document === "undefined") return;

    const onFullscreenChange = () => {
      const next = !!document.fullscreenElement;
      if (wasFullscreenRef.current && !next && enabled && hasEnteredOnceRef.current) {
        onExitRef.current();
      }
      wasFullscreenRef.current = next;
      setIsFullscreen(next);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [enabled]);

  let phase: FullscreenPhase;
  if (!enabled || !fullscreenSupported()) {
    // Unsupported browser → never gate (GC7 degrade-safe): the student runs the exam without
    // fullscreen rather than being blocked by a gate whose button cannot enter fullscreen.
    phase = "ready";
  } else if (!hasEnteredOnceRef.current && !isFullscreen) {
    phase = "start-gate";
  } else if (hasEnteredOnceRef.current && !isFullscreen) {
    phase = "resume-gate";
  } else {
    phase = "ready";
  }

  return { phase, requestFullscreen };
}

function exitFullscreen() {
  if (typeof document === "undefined" || !document.fullscreenElement) return;
  document.exitFullscreen().catch(() => {});
}

/**
 * Leaves fullscreen once the exam is `done` or the page unmounts, so it does not follow the student
 * to the next page. `done` must turn true only after the runner is gone: exiting while
 * `useExamFullscreen` is mounted is reported as an exit-fullscreen violation.
 */
export function useExitFullscreenAfterExam(done: boolean): void {
  useEffect(() => {
    if (done) exitFullscreen();
  }, [done]);
  useEffect(() => exitFullscreen, []);
}
