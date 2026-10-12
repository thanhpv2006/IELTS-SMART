"use client";

import type { AIImportAuditFinding } from "./types";
import { Badge } from "@/components/ui/badge";

const SKILL_LABEL: Record<string, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

function FindingList({ findings, tone }: { findings: AIImportAuditFinding[]; tone: "warning" | "gray" }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {findings.map((finding, index) => (
        <li
          key={`${finding.code}-${finding.skill}-${finding.question}-${index}`}
          data-testid={`ai-import-audit-${finding.code}`}
          className="flex flex-wrap items-center gap-2 text-xs text-ink-700"
        >
          <Badge tone={tone}>{SKILL_LABEL[finding.skill] ?? finding.skill ?? "Chung"}</Badge>
          {finding.question > 0 && <span className="font-semibold text-ink-600">Câu {finding.question}</span>}
          <span>{finding.message}</span>
        </li>
      ))}
    </ul>
  );
}

export interface AuditPanelProps {
  findings: AIImportAuditFinding[];
}

export function AuditPanel({ findings }: AuditPanelProps) {
  const warnings = findings.filter((f) => f.level === "warn");
  const notes = findings.filter((f) => f.level !== "warn");

  return (
    <section
      data-testid="ai-import-audit"
      className="flex flex-col gap-3 rounded-lg border border-ink-200 bg-ink-25 px-4 py-3"
    >
      <div>
        <h3 className="text-sm font-bold text-ink-800">
          Ghi chú kiểm tra máy <span className="font-normal text-ink-400">({findings.length})</span>
        </h3>
        <p className="mt-1 text-xs text-ink-500">
          Đây là ghi chú, <strong className="font-semibold">không chặn</strong> việc tạo đề — bạn xem rồi tự
          quyết định sửa hay bỏ qua.
        </p>
      </div>

      {findings.length === 0 ? (
        <p className="text-xs text-ink-500">Không có ghi chú nào.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {warnings.length > 0 && <FindingList findings={warnings} tone="warning" />}
          {notes.length > 0 && <FindingList findings={notes} tone="gray" />}
        </div>
      )}
    </section>
  );
}
