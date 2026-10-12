"use client";

import { useState } from "react";
import type { AIImportInventoryFile, AIImportRegion, AIImportRegionRole } from "./types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ROLE_LABEL: Record<AIImportRegionRole, string> = {
  listening_paper: "Đề Listening",
  reading_paper: "Đề Reading",
  writing_task: "Đề Writing",
  speaking_part: "Đề Speaking",
  answer_key: "Đáp án",
  explanation: "Giải thích đáp án",
  transcript: "Transcript bài nghe",
  sample_answer: "Bài mẫu",
  figure: "Ảnh minh hoạ",
  audio: "Audio bài nghe",
  ignore: "Bỏ qua",
};

const ROLES = Object.keys(ROLE_LABEL) as AIImportRegionRole[];

const SKILL_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "listening", label: "Listening" },
  { value: "reading", label: "Reading" },
  { value: "writing", label: "Writing" },
  { value: "speaking", label: "Speaking" },
];

const CONFIDENCE_TONE = { high: "success", medium: "warning", low: "error" } as const;
const CONFIDENCE_LABEL = { high: "Chắc", medium: "Tạm", low: "Đoán" } as const;
const SOURCE_LABEL: Record<AIImportRegion["source"], string> = {
  rubric: "theo dấu hiệu trong file",
  llm: "AI đọc và đoán",
  human: "bạn đã sửa",
};

const selectCls =
  "w-full rounded-md border border-input bg-white px-2 py-1 text-xs outline-none focus:border-brand-500";

function locatorLabel(file: AIImportInventoryFile, region: AIImportRegion): string {
  if (file.content_type.startsWith("audio/")) return "cả file";
  if (region.page_to > 0) return `trang ${region.page_from || 1}–${region.page_to}`;
  if (region.char_to > region.char_from) return `ký tự ${region.char_from}–${region.char_to}`;
  return "cả file";
}

function newRegion(file: AIImportInventoryFile): AIImportRegion {
  return {
    role: "ignore",
    skill: "",
    unit: 0,
    source_key: file.key,
    page_from: 0,
    page_to: 0,
    char_from: 0,
    char_to: 0,
    confidence: "high",
    evidence: "Người duyệt thêm vùng này",
    source: "human",
  };
}

export interface ClassificationPanelProps {
  inventory: AIImportInventoryFile[];
  onConfirm: (regions: AIImportRegion[]) => void;
  submitting: boolean;
}

export function ClassificationPanel({ inventory, onConfirm, submitting }: ClassificationPanelProps) {
  // A duplicate file's regions never reach the payload, so they are not editable here either —
  // whatever the twin says is what the pipeline reads.
  const [regions, setRegions] = useState<Record<string, AIImportRegion[]>>(() =>
    Object.fromEntries(inventory.map((f) => [f.key, f.duplicate_of ? [] : f.regions])),
  );

  const patch = (key: string, index: number, next: Partial<AIImportRegion>) => {
    setRegions((prev) => ({
      ...prev,
      [key]: prev[key].map((r, i) => (i === index ? { ...r, ...next } : r)),
    }));
  };

  const filenameOf = (key: string) => inventory.find((f) => f.key === key)?.filename ?? key;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-ink-800">AI đã nhận diện từng file thế nào</h3>
        <p className="mt-1 text-xs text-ink-500">
          Mỗi dòng là một phần trong file. Sửa lại dòng nào sai rồi bấm xác nhận — AI chỉ soạn câu hỏi sau khi
          bạn đồng ý với bảng này.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {inventory.map((file) => {
          const rows = regions[file.key] ?? [];
          const duplicate = file.duplicate_of !== "";
          return (
            <div
              key={file.key}
              data-testid={`ai-import-inventory-${file.filename}`}
              className={cn(
                "overflow-hidden rounded-lg border border-ink-200",
                duplicate && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">{file.filename}</p>
                  <p className="text-xs text-ink-500">
                    {file.content_type}
                    {file.pages > 0 && ` · ${file.pages} trang`}
                    {file.pages > 0 && (file.has_text_layer ? " · có lớp chữ" : " · bản scan")}
                    {file.duration_ms > 0 && ` · ${Math.round(file.duration_ms / 1000)}s`}
                  </p>
                </div>
                {duplicate && (
                  <Badge tone="gray">trùng file {filenameOf(file.duplicate_of)}</Badge>
                )}
              </div>

              {duplicate ? (
                <p className="px-3 py-2.5 text-xs text-ink-500">
                  File này giống hệt file trên nên được bỏ qua, không tính phí đọc lại.
                </p>
              ) : rows.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <p className="text-xs text-warning-700">
                    Không nhận ra phần nào trong file này — nó sẽ không được dùng nếu bạn không thêm vùng.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid={`ai-import-add-region-${file.filename}`}
                    onClick={() =>
                      setRegions((prev) => ({ ...prev, [file.key]: [...prev[file.key], newRegion(file)] }))
                    }
                  >
                    Thêm vùng
                  </Button>
                </div>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-ink-100 text-left text-ink-500">
                      <th className="px-3 py-1.5 font-semibold">Là gì</th>
                      <th className="px-3 py-1.5 font-semibold">Kỹ năng</th>
                      <th className="px-3 py-1.5 font-semibold">Part</th>
                      <th className="px-3 py-1.5 font-semibold">Vị trí</th>
                      <th className="px-3 py-1.5 font-semibold">Căn cứ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((region, index) => (
                      <tr key={index} className="border-b border-ink-100 last:border-0 align-top">
                        <td className="px-3 py-2">
                          <select
                            aria-label={`Vai trò vùng ${index + 1} của ${file.filename}`}
                            data-testid={`ai-import-role-${file.filename}-${index}`}
                            value={region.role}
                            onChange={(e) => patch(file.key, index, { role: e.target.value as AIImportRegionRole })}
                            className={selectCls}
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            aria-label={`Kỹ năng vùng ${index + 1} của ${file.filename}`}
                            data-testid={`ai-import-skill-${file.filename}-${index}`}
                            value={region.skill}
                            onChange={(e) => patch(file.key, index, { skill: e.target.value })}
                            className={selectCls}
                          >
                            {SKILL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            aria-label={`Part vùng ${index + 1} của ${file.filename}`}
                            data-testid={`ai-import-unit-${file.filename}-${index}`}
                            value={region.unit}
                            onChange={(e) => patch(file.key, index, { unit: Number(e.target.value) || 0 })}
                            className={cn(selectCls, "w-16")}
                          />
                          {region.unit === 0 && (
                            <span className="mt-0.5 block text-[10px] text-ink-400">tự chia theo số câu</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-ink-600">
                          {locatorLabel(file, region)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={CONFIDENCE_TONE[region.confidence]}>
                              {CONFIDENCE_LABEL[region.confidence]}
                            </Badge>
                            <span className="text-ink-600">{region.evidence}</span>
                            <span className="text-ink-400">({SOURCE_LABEL[region.source]})</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <Button
          type="button"
          data-testid="ai-import-confirm-classification"
          disabled={submitting}
          onClick={() => onConfirm(Object.values(regions).flat())}
        >
          {submitting ? "Đang dựng đề…" : "Xác nhận & dựng đề"}
        </Button>
      </div>
    </section>
  );
}
