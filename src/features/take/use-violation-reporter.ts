"use client";

import { useCallback, useEffect, useRef } from "react";
import { studentAssignmentApi } from "@/features/student/api";
import type { ViolationType } from "@/features/exam-rules/types";

const FLUSH_DELAY_MS = 5000;

type BufferedViolation = { type: string; occurred_at: string };

/**
 * Batches anti-cheat violation events emitted by the exam engine (`onViolation`) and reports them
 * to the backend in bursts instead of one request per event. A buffered batch flushes ~5s after
 * its first event (leading-edge window, not reset per-push), immediately when the tab is hidden,
 * and on unmount — so nothing lingers in memory across a page navigation. Network failures are
 * swallowed: reporting violations must never interrupt the exam.
 */
export function useViolationReporter(
  assignmentId: string,
  enabled: boolean,
): (e: { type: string }) => void {
  const bufferRef = useRef<BufferedViolation[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (bufferRef.current.length === 0) return;
    const batch = bufferRef.current;
    bufferRef.current = [];
    studentAssignmentApi
      .reportViolations(
        assignmentId,
        // The engine only ever emits values matching ViolationType; the buffer widens to `string`
        // purely for internal bookkeeping, so cast at this single call boundary.
        batch as unknown as { type: ViolationType; occurred_at?: string }[],
      )
      .catch(() => {});
  }, [assignmentId]);

  const report = useCallback(
    (e: { type: string }) => {
      if (!enabled) return;
      bufferRef.current.push({ type: e.type, occurred_at: new Date().toISOString() });
      if (timerRef.current === null) {
        timerRef.current = setTimeout(flush, FLUSH_DELAY_MS);
      }
    },
    [enabled, flush],
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flush();
    };
  }, [flush]);

  return report;
}
