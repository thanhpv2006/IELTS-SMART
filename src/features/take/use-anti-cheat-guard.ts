"use client";

import { useCallback, useRef, useState } from "react";
import { useViolationReporter } from "./use-violation-reporter";

/**
 * Page-level anti-cheat guard (design item 2). Lives above `ExamSkillRunner` so the strike
 * counters survive skill remounts (mock remounts the wrapper per skill via `key`).
 *
 * Every violation is forwarded to `useViolationReporter` for backend reporting. Two violation
 * types escalate, each with its OWN independent 2-strike counter (design GC1):
 *  - `"leave-tab"` (visibilitychange hidden): strike 1 opens the tab resume-gate (`tabGateOpen`,
 *    page blurs the content behind it); strike 2 calls `onTerminate`.
 *  - `"exit-fullscreen"` (app-emitted): strike 1 is handled by the fullscreen resume-gate already
 *    shown by `useExamFullscreen` (nothing extra here); strike 2 calls `onTerminate`.
 * `blur` / `copy` / `paste-blocked` are logged but NEVER count toward any strike (blur has many
 * benign causes — URL bar, DevTools, OS popups — so counting it would end the exam falsely;
 * tab-switch fires both blur and leave-tab, so counting leave-tab only also avoids double-count).
 *
 * `onTerminate` fires at most once (guarded by `terminatedRef`).
 */
export function useAntiCheatGuard(
  assignmentId: string,
  enabled: boolean,
  opts: { onTerminate: () => void },
): { report: (e: { type: string }) => void; tabGateOpen: boolean; acknowledgeTab: () => void } {
  const reportViolation = useViolationReporter(assignmentId, enabled);
  const [tabGateOpen, setTabGateOpen] = useState(false);
  const tabStrikeCountRef = useRef(0);
  const fsStrikeCountRef = useRef(0);
  const terminatedRef = useRef(false);
  // Hold onTerminate in a ref so `report` keeps a stable identity even when the caller passes an
  // inline `{ onTerminate }` (new object each render) — otherwise the engine re-subscribes its
  // violation listeners on every render (design GC5).
  const onTerminateRef = useRef(opts.onTerminate);
  onTerminateRef.current = opts.onTerminate;

  const report = useCallback(
    (e: { type: string }) => {
      reportViolation(e);
      if (e.type === "leave-tab") {
        tabStrikeCountRef.current += 1;
        if (tabStrikeCountRef.current === 1) {
          setTabGateOpen(true);
        } else if (tabStrikeCountRef.current >= 2 && !terminatedRef.current) {
          terminatedRef.current = true;
          // Close the strike-1 gate (if still open) so it can't stack over the ended overlay.
          setTabGateOpen(false);
          onTerminateRef.current();
        }
      } else if (e.type === "exit-fullscreen") {
        fsStrikeCountRef.current += 1;
        // Strike 1: the fullscreen resume-gate (useExamFullscreen) already blocks + warns, so no
        // extra action here. Strike 2: terminate.
        if (fsStrikeCountRef.current >= 2 && !terminatedRef.current) {
          terminatedRef.current = true;
          onTerminateRef.current();
        }
      }
    },
    [reportViolation],
  );

  const acknowledgeTab = useCallback(() => setTabGateOpen(false), []);

  return { report, tabGateOpen, acknowledgeTab };
}
