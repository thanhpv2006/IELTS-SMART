"use client";

import type { AIImportAuditFinding } from "./types";
import { Badge } from "@/components/ui/badge";

const SKILL_LABEL: Record<string, string> = {
  listening: "Listening",
  reading: "Reading",
};

export interface CheckpointProblemsProps {
  problems: AIImportAuditFinding[];
}

export function CheckpointProblems({ problems }: CheckpointProblemsProps) {
  if (problems.length === 0) return null;

  return (
    <section
      data-testid="ai-import-checkpoint-problems"
      className="flex flex-col gap-3 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3"
    >
      <div>
        <h3 className="text-sm font-bold text-ink-800">Máy dừng lại để bạn xem trước khi dựng đề</h3>
        <p className="mt-1 text-xs text-ink-600">
          Sửa bảng nhận diện bên dưới nếu cần, rồi bấm Xác nhận &amp; dựng đề.
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {problems.map((problem, index) => (
          <li
            key={`${problem.code}-${index}`}
            data-testid={`ai-import-problem-${problem.code}`}
            className="flex flex-wrap items-center gap-2 text-xs text-ink-700"
          >
            <Badge tone="warning">{SKILL_LABEL[problem.skill] ?? "Chung"}</Badge>
            <span>{problem.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
