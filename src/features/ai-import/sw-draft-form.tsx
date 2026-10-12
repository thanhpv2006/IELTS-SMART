"use client";

import { useRef, useState } from "react";
import { presignAIImportUpload } from "./api";
import type { AIImportQuestionDraft } from "./types";
import { errorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function metaString(metadata: Record<string, unknown>, key: string): string {
  const v = metadata[key];
  return typeof v === "string" ? v : "";
}

function metaNumber(metadata: Record<string, unknown>, key: string): string {
  const v = metadata[key];
  return typeof v === "number" ? String(v) : "";
}

// A field set to undefined here means "cleared" and must be dropped from metadata entirely —
// keeping it as an explicit null/"" would still trip ValidateSWMetadata's type check on the
// next QC run (internal/catalog/app/sw_metadata.go only type-checks keys that are present).
export type SWFieldPatch = Partial<{ task_type: string; min_words: number; image_url: string }>;

export function mergeSWMetadata(
  metadata: Record<string, unknown>,
  patch: SWFieldPatch,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...metadata, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
  }
  return next;
}

export interface SWDraftFormProps {
  draft: AIImportQuestionDraft;
  onChange: (next: AIImportQuestionDraft) => void;
}

// These three keys only apply to writing_task1/2 in domain.Metadata's documented shape
// (speaking_part1/3 instead carries examiner_audio_url, out of scope here) — mirrors the
// skill-gated fields in features/catalog/question-editor.tsx.
export function SWDraftForm({ draft, onChange }: SWDraftFormProps) {
  const isWriting = draft.skill === "writing";
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const patchMetadata = (patch: SWFieldPatch) => {
    onChange({ ...draft, metadata: mergeSWMetadata(draft.metadata, patch) });
  };

  const handleImageFile = async (file: File) => {
    setUploadError(null);
    setUploadingImage(true);
    try {
      const contentType = file.type || "image/png";
      const { upload_url, public_url } = await presignAIImportUpload("image", file);
      const res = await fetch(upload_url, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
      if (!res.ok) throw new Error(`Upload thất bại (${res.status})`);
      patchMetadata({ image_url: public_url });
    } catch (e) {
      setUploadError(errorMessage(e));
    } finally {
      setUploadingImage(false);
    }
  };

  const imageUrl = metaString(draft.metadata, "image_url");
  const taskType = metaString(draft.metadata, "task_type");
  const minWords = metaNumber(draft.metadata, "min_words");

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-ink-700">Nội dung câu hỏi</label>
        <textarea
          data-testid="sw-draft-prompt"
          value={draft.prompt}
          onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
          rows={6}
          className={inputCls}
        />
      </div>

      {isWriting && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Loại task</label>
              <select
                data-testid="sw-draft-task-type"
                value={taskType}
                onChange={(e) => patchMetadata({ task_type: e.target.value || undefined })}
                className={inputCls}
              >
                <option value="">—</option>
                <option value="task1">Task 1</option>
                <option value="task2">Task 2</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Số từ tối thiểu</label>
              <input
                type="number"
                min={0}
                data-testid="sw-draft-min-words"
                value={minWords}
                onChange={(e) => patchMetadata({ min_words: e.target.value ? Number(e.target.value) : undefined })}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Ảnh minh hoạ (Task 1)</label>
            <div className="flex items-center gap-2">
              {!imageUrl && (
                <span className="min-w-0 flex-1 text-sm text-ink-400">Chưa có ảnh — bấm Upload để tải ảnh</span>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingImage}
                onClick={() => imageInputRef.current?.click()}
              >
                {uploadingImage ? "Đang tải…" : "Upload"}
              </Button>
              {imageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-500 hover:bg-red-50"
                  onClick={() => patchMetadata({ image_url: undefined })}
                >
                  Xoá
                </Button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                data-testid="sw-draft-image-input"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleImageFile(file);
                }}
              />
            </div>
            {uploadError && <p className="mt-1 text-xs text-error-600">{uploadError}</p>}
            {imageUrl && (
              <img src={imageUrl} alt="Minh hoạ Task 1" className="mt-2 max-h-40 rounded-lg border border-ink-100 object-contain" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
