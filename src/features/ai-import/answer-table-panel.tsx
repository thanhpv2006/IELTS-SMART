"use client";

import type { AIImportAnswerRow, AIImportAnswerTable } from "./types";
import { Badge } from "@/components/ui/badge";

const NORMALIZED_BY_LABEL: Record<string, string> = {
  parser: "Đọc trực tiếp từ file đáp án",
  llm: "AI chuẩn hoá lại format",
};

function SkillTable({ title, rows }: { title: string; rows: AIImportAnswerRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200">
      <p className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600">
        {title} <span className="font-normal text-ink-400">({rows.length} câu)</span>
      </p>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-ink-100 text-left text-ink-500">
              <th className="px-3 py-1.5 font-semibold">Câu</th>
              <th className="px-3 py-1.5 font-semibold">Đáp án</th>
              <th className="px-3 py-1.5 font-semibold">Chấp nhận thêm</th>
              <th className="px-3 py-1.5 font-semibold">Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.number}
                data-testid={`ai-import-answer-row-${title}-${row.number}`}
                className="border-b border-ink-100 last:border-0"
              >
                <td className="px-3 py-1.5 font-semibold text-ink-700">{row.number}</td>
                <td className="px-3 py-1.5 text-ink-800">{(row.answer_key ?? []).join(" · ")}</td>
                <td className="px-3 py-1.5 text-ink-500">{(row.accepted_variants ?? []).join(" · ") || "—"}</td>
                <td className="px-3 py-1.5">
                  {row.source === "llm" ? (
                    <Badge tone="warning">AI chuẩn hoá</Badge>
                  ) : (
                    <span className="text-ink-400">parser</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface AnswerTablePanelProps {
  table: AIImportAnswerTable;
}

export function AnswerTablePanel({ table }: AnswerTablePanelProps) {
  const total = table.listening.length + table.reading.length;
  return (
    <section data-testid="ai-import-answer-table" className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-bold text-ink-800">Bảng đáp án đọc được từ file</h3>
        <p className="mt-1 text-xs text-ink-500">
          {NORMALIZED_BY_LABEL[table.normalized_by] ?? (table.normalized_by || "Chưa đọc được đáp án")} ·{" "}
          {total} câu. Đây là bảng AI sẽ chấm theo — sai ở đây thì đề sinh ra cũng sai.
        </p>
      </div>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-400">
          Chưa đọc được đáp án nào từ file đã tải lên.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <SkillTable title="Listening" rows={table.listening} />
          <SkillTable title="Reading" rows={table.reading} />
        </div>
      )}
    </section>
  );
}
