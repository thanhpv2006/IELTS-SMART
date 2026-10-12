"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "./api";
import type { CatalogQuestion } from "./types";
import { mediaApi } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { cn, stripHtml } from "@/lib/utils";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ImageUploadField } from "@/components/ui/image-upload-field";

// Reading/Listening authoring is a deferred follow-up — this editor only
// covers Speaking/Writing reusable catalog questions (no answer-key/groups UI).

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const PARTS: Record<"speaking" | "writing", number[]> = {
  speaking: [1, 2, 3],
  writing: [1, 2],
};

interface QuestionEditorProps {
  open: boolean;
  onClose: () => void;
  question?: CatalogQuestion;
  onSaved?: (questionId?: string) => void;
  /** Set by the parent (unified set editor) to lock the skill selector — the tab/set decides it, not the user. */
  lockedSkill?: "speaking" | "writing";
  /** The Part the set already holds. Authoring a question on any other Part would be rejected on
   *  attach, after the question had been created and published — so the set fixes it up front. */
  lockedPart?: number;
}

export function QuestionEditor({ open, onClose, question, onSaved, lockedSkill, lockedPart }: QuestionEditorProps) {
  const qc = useQueryClient();
  const editMode = !!question;
  const skillLocked = editMode || !!lockedSkill;
  const partLocked = editMode || lockedPart != null;

  const { data: categories = [] } = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: catalogApi.listCategories,
  });

  const [skill, setSkill] = useState<"speaking" | "writing">(
    lockedSkill ?? (question?.skill as "speaking" | "writing") ?? "speaking",
  );
  const [part, setPart] = useState<number>(question?.part ?? lockedPart ?? 1);
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [categoryId, setCategoryId] = useState<string>(question?.category_id ?? "");
  const [examinerAudioUrl, setExaminerAudioUrl] = useState<string | undefined>(
    question?.metadata?.examiner_audio_url as string | undefined,
  );
  const [imageUrl, setImageUrl] = useState<string | undefined>(
    question?.metadata?.image_url as string | undefined,
  );
  const [taskType, setTaskType] = useState<string>((question?.metadata?.task_type as string | undefined) ?? "");
  const [minWords, setMinWords] = useState<string>(
    question?.metadata?.min_words != null ? String(question.metadata.min_words) : "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Re-hydrate form whenever the dialog (re)opens for a given question.
  useEffect(() => {
    if (!open) return;
    setSkill(lockedSkill ?? (question?.skill as "speaking" | "writing") ?? "speaking");
    setPart(question?.part ?? lockedPart ?? 1);
    setPrompt(question?.prompt ?? "");
    setCategoryId(question?.category_id ?? "");
    setExaminerAudioUrl(question?.metadata?.examiner_audio_url as string | undefined);
    setImageUrl(question?.metadata?.image_url as string | undefined);
    setTaskType((question?.metadata?.task_type as string | undefined) ?? "");
    setMinWords(question?.metadata?.min_words != null ? String(question.metadata.min_words) : "");
    setFormError(null);
  }, [open, question, lockedSkill, lockedPart]);

  const handleSkillChange = (next: "speaking" | "writing") => {
    setSkill(next);
    setPart(PARTS[next][0]);
  };

  const handleAudioFile = async (file: File) => {
    setFormError(null);
    setUploadingAudio(true);
    try {
      const contentType = file.type || "audio/mpeg";
      const { upload_url, public_url } = await mediaApi.presignUpload({
        media_type: "audio",
        content_type: contentType,
      });
      const res = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!res.ok) throw new Error(`Upload thất bại (${res.status})`);
      setExaminerAudioUrl(public_url);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Upload thất bại");
    } finally {
      setUploadingAudio(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const metadata: Record<string, unknown> = { ...(question?.metadata ?? {}) };
      if (skill === "speaking") {
        if (examinerAudioUrl) metadata.examiner_audio_url = examinerAudioUrl;
        else delete metadata.examiner_audio_url;
        delete metadata.image_url;
        delete metadata.task_type;
        delete metadata.min_words;
      } else {
        if (imageUrl) metadata.image_url = imageUrl;
        else delete metadata.image_url;
        if (taskType.trim()) metadata.task_type = taskType.trim();
        else delete metadata.task_type;
        if (minWords.trim()) metadata.min_words = Number(minWords);
        else delete metadata.min_words;
        delete metadata.examiner_audio_url;
      }
      if (question) {
        await catalogApi.update(question.id, {
          prompt,
          metadata,
          category_id: categoryId || undefined,
        });
        return undefined;
      }
      const { id } = await catalogApi.create({
        skill,
        part,
        prompt,
        metadata,
        category_id: categoryId || undefined,
      });
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["catalog-questions"] });
      onSaved?.(id);
      onClose();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!stripHtml(prompt)) {
      setFormError("Vui lòng nhập nội dung câu hỏi.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title={editMode ? "Sửa câu hỏi" : "Tạo câu hỏi"} size="lg">
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Kỹ năng</label>
              <select
                data-testid="question-editor-skill"
                value={skill}
                disabled={skillLocked}
                onChange={(e) => handleSkillChange(e.target.value as "speaking" | "writing")}
                className={cn(inputCls, skillLocked && "cursor-not-allowed bg-ink-50 text-ink-500")}
              >
                <option value="speaking">Speaking</option>
                <option value="writing">Writing</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Phần</label>
              <select
                data-testid="question-editor-part"
                value={part}
                disabled={partLocked}
                onChange={(e) => setPart(Number(e.target.value))}
                className={cn(inputCls, partLocked && "cursor-not-allowed bg-ink-50 text-ink-500")}
              >
                {PARTS[skill].map((p) => (
                  <option key={p} value={p}>
                    {skill === "writing" ? `Task ${p}` : `Part ${p}`}
                  </option>
                ))}
              </select>
              {lockedPart != null && !editMode && (
                <p className="mt-1.5 text-xs text-ink-400">
                  Bộ đề này thuộc {skill === "writing" ? `Task ${lockedPart}` : `Part ${lockedPart}`}. Muốn
                  ra đề Part khác, hãy tạo bộ riêng.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Nội dung câu hỏi <span className="text-brand-500">*</span>
            </label>
            <RichTextEditor value={prompt} onChange={setPrompt} placeholder="Nhập câu hỏi…" minHeight={140} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Chủ đề</label>
            <select
              data-testid="question-editor-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputCls}
            >
              <option value="">— Không có chủ đề —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {skill === "speaking" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Audio giám khảo (tuỳ chọn)</label>
              <div className="flex items-center gap-2">
                {!examinerAudioUrl && (
                  <span className="min-w-0 flex-1 text-sm text-ink-400">
                    Chưa có audio — bấm Upload để tải file mp3/wav
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingAudio}
                  onClick={() => audioInputRef.current?.click()}
                >
                  {uploadingAudio ? "Đang tải…" : "Upload"}
                </Button>
                {examinerAudioUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-500 hover:bg-red-50"
                    onClick={() => setExaminerAudioUrl(undefined)}
                  >
                    Xoá
                  </Button>
                )}
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAudioFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
              {examinerAudioUrl && <audio controls src={examinerAudioUrl} className="mt-2 w-full" />}
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">
                  Ảnh minh hoạ (Task 1, tuỳ chọn)
                </label>
                <ImageUploadField value={imageUrl} onChange={setImageUrl} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">Loại task (tuỳ chọn)</label>
                  <input
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    placeholder="VD: line-graph"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-ink-700">Số từ tối thiểu (tuỳ chọn)</label>
                  <input
                    type="number"
                    min={0}
                    value={minWords}
                    onChange={(e) => setMinWords(e.target.value)}
                    placeholder="150"
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          )}

          {formError && (
            <p data-testid="question-editor-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
              {formError}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button data-testid="question-editor-save" type="submit" disabled={mutation.isPending || uploadingAudio}>
            {mutation.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Huỷ
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
