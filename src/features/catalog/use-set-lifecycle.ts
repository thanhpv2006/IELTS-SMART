"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { catalogApi } from "./api";
import { errorMessage } from "@/lib/api/errors";

export type SetLifecycleAction = "archive" | "restore" | "delete";
export type SetLifecycleOutcome = { succeeded: string[]; failed: string[] };
export type SetLifecycleMessage = { text: string; tone: "success" | "error" };

const VERBS: Record<SetLifecycleAction, string> = {
  archive: "lưu trữ",
  restore: "khôi phục",
  delete: "xoá",
};

const CALLS: Record<SetLifecycleAction, (id: string) => Promise<void>> = {
  archive: catalogApi.archiveSet,
  restore: catalogApi.restoreSet,
  delete: catalogApi.deleteSet,
};

export function lifecycleMessage(action: SetLifecycleAction, total: number, errors: string[]): SetLifecycleMessage {
  const verb = VERBS[action];
  if (errors.length === 0) return { text: `Đã ${verb} ${total} đề.`, tone: "success" };
  const reasons = [...new Set(errors)].join("; ");
  return {
    text: `Đã ${verb} ${total - errors.length}/${total} đề. Không ${verb} được ${errors.length} đề: ${reasons}`,
    tone: "error",
  };
}

export function useSetLifecycle() {
  const qc = useQueryClient();
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<SetLifecycleMessage | null>(null);

  const run = useCallback(
    async (action: SetLifecycleAction, ids: string[]): Promise<SetLifecycleOutcome> => {
      if (running.current || ids.length === 0) return { succeeded: [], failed: [] };
      running.current = true;
      setPending(true);
      setMessage(null);
      try {
        const results = await Promise.allSettled(ids.map((id) => CALLS[action](id)));
        const succeeded: string[] = [];
        const failed: string[] = [];
        const errors: string[] = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            succeeded.push(ids[i]);
          } else {
            failed.push(ids[i]);
            errors.push(errorMessage(r.reason));
          }
        });

        for (const id of succeeded) {
          if (action === "delete") qc.removeQueries({ queryKey: ["catalog-set", id] });
          else await qc.invalidateQueries({ queryKey: ["catalog-set", id] });
        }
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["catalog-sets"] }),
          qc.invalidateQueries({ queryKey: ["library"] }),
        ]);

        setMessage(lifecycleMessage(action, ids.length, errors));
        return { succeeded, failed };
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [qc],
  );

  const clearMessage = useCallback(() => setMessage(null), []);

  return { run, pending, message, clearMessage };
}
