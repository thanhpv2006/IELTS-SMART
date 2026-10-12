"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { assignmentApi } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import type { Batch } from "@/features/partner/assignment-groups";

export type BulkMessage = { text: string; tone: "success" | "error" };

const partial = (verb: string, done: number, asked: number): BulkMessage =>
  done === asked
    ? { text: `${verb} ${done} bài.`, tone: "success" }
    : { text: `${verb} ${done}/${asked} bài.`, tone: "error" };

export function useBulkAssignmentMutation(onDone: () => void) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<BulkMessage | null>(null);

  const run = async (fn: () => Promise<BulkMessage>) => {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      setMessage(await fn());
      await qc.invalidateQueries({ queryKey: ["assignments"] });
      onDone();
    } catch (e) {
      setMessage({ text: errorMessage(e), tone: "error" });
    } finally {
      setPending(false);
    }
  };

  const reschedule = (batches: Batch[], deadline: string | null) =>
    run(async () => {
      const ids = batches.flatMap((b) => b.assignmentIds);
      const { updated } = await assignmentApi.reschedule({ assignment_ids: ids, deadline });
      return partial("Đã cập nhật hạn nộp cho", updated, ids.length);
    });

  const closeNow = (batches: Batch[]) => reschedule(batches, new Date().toISOString());

  const withdraw = (batches: Batch[]) =>
    run(async () => {
      const ids = batches.flatMap((b) => b.pendingIds);
      const { deleted } = await assignmentApi.withdraw({ assignment_ids: ids });
      return partial("Đã thu hồi", deleted, ids.length);
    });

  // The assign endpoint takes one set per call, so a multi-batch selection is
  // replayed batch by batch.
  const reassign = (batches: Batch[], deadline?: string) =>
    run(async () => {
      const targets = batches.filter((b) => b.pendingStudentIds.length > 0);
      let assigned = 0;
      for (const b of targets) {
        const { ids } = await assignmentApi.assign(b.testId, {
          student_ids: b.pendingStudentIds,
          class_id: b.classId,
          deadline,
          time_limit_minutes: b.timeLimitMinutes,
        });
        assigned += ids.length;
      }
      const asked = targets.reduce((n, b) => n + b.pendingStudentIds.length, 0);
      return partial("Đã giao lại", assigned, asked);
    });

  return { reschedule, closeNow, withdraw, reassign, pending, message, setMessage };
}
