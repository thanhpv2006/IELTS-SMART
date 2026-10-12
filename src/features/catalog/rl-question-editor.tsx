"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RLGroupType } from "@novaforge-team/ielts-exam-engine";
import { catalogApi } from "./api";
import type { CatalogQuestion, RLGroupDraft, RLItemDraft } from "./types";
import { RL_PARTS } from "./types";
import { emptyGroup, duplicateNumbers, isItemReachable } from "./rl-metadata";
import { normalizeContentHtml } from "./rl-form-html";
import { RLGroupEditor } from "./rl-group-editor";
import { mediaApi } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { cn, stripAnswerMarks, stripHtml } from "@/lib/utils";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

type RLSkill = "reading" | "listening";

interface RLQuestionEditorProps {
  open: boolean;
  onClose: () => void;
  skill: RLSkill;
  question?: CatalogQuestion;
  onSaved?: (questionId?: string) => void;
  /** When provided, the save flow calls this instead of the catalog create/update API. */
  onSubmit?: (payload: { metadata: Record<string, unknown>; prompt: string; part: number }) => Promise<void>;
}

export type BuildRLMetadataArgs = {
  groups: RLGroupDraft[];
  skill: RLSkill;
  audioUrl: string | undefined;
  transcript: string;
  prompt: string;
};

/** Build the catalog `metadata` + cleaned `prompt` payload from R/L authoring form state. */
export function buildRLMetadata({
  groups,
  skill,
  audioUrl,
  transcript,
  prompt,
}: BuildRLMetadataArgs): { metadata: Record<string, unknown>; prompt: string } {
  const cleanGroups = groups
    .map(({ _key, ...g }) => ({
      ...g,
      shared_options: g.shared_options?.map((s) => s.trim()).filter(Boolean),
      items: g.items.map((it) => ({
        ...it,
        prompt: it.prompt?.trim() ? it.prompt : undefined,
        options: it.options?.map((o) => o.trim()).filter(Boolean),
      })),
    }))
    .map((g) => ({
      ...g,
      title: g.title?.trim() || undefined,
      content_html: normalizeContentHtml(g.content_html),
      instructions_html: normalizeContentHtml(g.instructions_html),
      shared_options: g.shared_options?.length ? g.shared_options : undefined,
      items: g.items.map((it) => ({
        ...it,
        options: it.options?.length ? it.options : undefined,
        explanation: it.explanation?.trim() ? it.explanation : undefined,
      })),
    }));
  const metadata: Record<string, unknown> = { groups: cleanGroups };
  if (skill === "listening" && audioUrl) metadata.audio_url = audioUrl;
  if (skill === "listening" && transcript.trim()) metadata.transcript = transcript;
  if (skill === "reading") metadata.passage_html_marked = prompt;
  const cleanPrompt = skill === "reading" ? stripAnswerMarks(prompt) : prompt;
  return { metadata, prompt: cleanPrompt };
}

/** Best-effort normalization of a raw metadata item into a well-formed RLItemDraft. */
function normalizeItem(raw: unknown): RLItemDraft {
  const it = (raw ?? {}) as Partial<RLItemDraft> & { number?: unknown };
  return {
    number: typeof it.number === "number" ? it.number : 0,
    prompt: typeof it.prompt === "string" ? it.prompt : undefined,
    options: Array.isArray(it.options) ? (it.options as string[]) : undefined,
    answer_key: Array.isArray(it.answer_key) ? (it.answer_key as string[]) : [],
    accepted_variants: Array.isArray(it.accepted_variants) ? (it.accepted_variants as string[]) : undefined,
    explanation: typeof it.explanation === "string" ? it.explanation : undefined,
  };
}

/** Best-effort normalization of a raw metadata group into a well-formed RLGroupDraft. */
function normalizeGroup(raw: unknown): RLGroupDraft {
  const g = (raw ?? {}) as Partial<RLGroupDraft> & { type?: unknown; items?: unknown };
  return {
    type: (typeof g.type === "string" ? g.type : "gap_fill") as RLGroupType,
    section: typeof g.section === "number" ? g.section : undefined,
    instructions_html: typeof g.instructions_html === "string" ? g.instructions_html : undefined,
    title: typeof g.title === "string" ? g.title : undefined,
    content_html: typeof g.content_html === "string" ? g.content_html : undefined,
    image_url: typeof g.image_url === "string" ? g.image_url : undefined,
    shared_options: Array.isArray(g.shared_options) ? (g.shared_options as string[]) : undefined,
    select_count: typeof g.select_count === "number" ? g.select_count : undefined,
    items: Array.isArray(g.items) ? g.items.map(normalizeItem) : [],
    _key: crypto.randomUUID(),
  };
}

export function parseGroupsFromMetadata(metadata: Record<string, unknown> | undefined): RLGroupDraft[] {
  const raw = metadata?.groups;
  if (!Array.isArray(raw)) return [emptyGroup("gap_fill")];
  const groups = raw.map(normalizeGroup);
  return groups.length > 0 ? groups : [emptyGroup("gap_fill")];
}

export function RLQuestionEditor({ open, onClose, skill, question, onSaved, onSubmit }: RLQuestionEditorProps) {
  const qc = useQueryClient();
  const editMode = !!question;

  const { data: categories = [] } = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: catalogApi.listCategories,
  });

  const [part, setPart] = useState<number>(question?.part ?? RL_PARTS[skill][0]);
  const [prompt, setPrompt] = useState(
    (question?.metadata?.passage_html_marked as string | undefined) ?? question?.prompt ?? "",
  );
  const [categoryId, setCategoryId] = useState<string>(question?.category_id ?? "");
  const [audioUrl, setAudioUrl] = useState<string | undefined>(
    question?.metadata?.audio_url as string | undefined,
  );
  const [transcript, setTranscript] = useState<string>(
    (question?.metadata?.transcript as string | undefined) ?? "",
  );
  const [groups, setGroups] = useState<RLGroupDraft[]>(() => parseGroupsFromMetadata(question?.metadata));
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Re-hydrate form whenever the dialog (re)opens for a given question.
  useEffect(() => {
    if (!open) return;
    setPart(question?.part ?? RL_PARTS[skill][0]);
    setPrompt((question?.metadata?.passage_html_marked as string | undefined) ?? question?.prompt ?? "");
    setCategoryId(question?.category_id ?? "");
    setAudioUrl(question?.metadata?.audio_url as string | undefined);
    setTranscript((question?.metadata?.transcript as string | undefined) ?? "");
    setGroups(parseGroupsFromMetadata(question?.metadata));
    setFormError(null);
  }, [open, question?.id, skill]);

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
      setAudioUrl(public_url);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Upload thất bại");
    } finally {
      setUploadingAudio(false);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { metadata, prompt: cleanPrompt } = buildRLMetadata({ groups, skill, audioUrl, transcript, prompt });
      if (onSubmit) {
        await onSubmit({ metadata, prompt: cleanPrompt, part });
        return undefined;
      }
      if (question) {
        await catalogApi.update(question.id, {
          prompt: cleanPrompt,
          metadata,
          category_id: categoryId || undefined,
        });
        return undefined;
      } else {
        const { id } = await catalogApi.create({
          skill,
          part,
          prompt: cleanPrompt,
          metadata,
          category_id: categoryId || undefined,
        });
        return id;
      }
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["catalog-questions"] });
      onSaved?.(id);
      onClose();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  // Drop the `0` placeholder of not-yet-numbered items: it must not surface as
  // a selectable "Câu 0" in the answer-span dropdown, nor skew nextNumberFrom.
  const existingNumbers = groups.flatMap((g) => g.items.map((it) => it.number)).filter((n) => n > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingAudio) return;
    setFormError(null);

    if (!stripHtml(prompt)) {
      setFormError("Vui lòng nhập đoạn văn / ngữ cảnh.");
      return;
    }
    if (groups.length === 0) {
      setFormError("Cần ít nhất 1 nhóm câu hỏi.");
      return;
    }
    if (groups.some((g) => g.items.length === 0)) {
      setFormError("Mỗi nhóm cần ít nhất 1 câu hỏi.");
      return;
    }
    if (groups.some((g) => g.items.some((it) => it.answer_key.length === 0))) {
      setFormError("Mọi câu hỏi cần có đáp án.");
      return;
    }
    const dups = duplicateNumbers(groups);
    if (dups.length > 0) {
      setFormError(`Số thứ tự câu bị trùng: ${dups.join(", ")}.`);
      return;
    }
    const unreachable = groups.some((g) => g.items.some((it) => !isItemReachable(g, it)));
    if (unreachable) {
      setFormError("Có đáp án chưa nằm trong danh sách lựa chọn.");
      return;
    }

    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${question ? "Sửa" : "Tạo"} câu hỏi ${skill === "reading" ? "Reading" : "Listening"}`}
      size="xl"
    >
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Kỹ năng</label>
              <div className={cn(inputCls, "cursor-not-allowed bg-ink-50 text-ink-500")}>
                {skill === "reading" ? "Reading" : "Listening"}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Phần</label>
              <select
                data-testid="rl-question-editor-part"
                value={part}
                disabled={editMode}
                onChange={(e) => setPart(Number(e.target.value))}
                className={cn(inputCls, editMode && "cursor-not-allowed bg-ink-50 text-ink-500")}
              >
                {RL_PARTS[skill].map((p) => (
                  <option key={p} value={p}>
                    Part {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              {skill === "reading" ? "Đoạn văn (Passage)" : "Ngữ cảnh / hướng dẫn"}{" "}
              <span className="text-brand-500">*</span>
            </label>
            <RichTextEditor
              value={prompt}
              onChange={setPrompt}
              placeholder="Nhập nội dung…"
              minHeight={160}
              answerSpans={skill === "reading" ? { numbers: existingNumbers } : undefined}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Chủ đề</label>
            <select
              data-testid="rl-question-editor-category"
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

          {skill === "listening" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Audio (bắt buộc khi phát hành)</label>
              <div className="flex items-center gap-2">
                {!audioUrl && (
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
                {audioUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-500 hover:bg-red-50"
                    onClick={() => setAudioUrl(undefined)}
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
              {audioUrl && <audio controls src={audioUrl} className="mt-2 w-full" />}
            </div>
          )}

          {skill === "listening" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">
                Transcript — bôi đen đoạn chứa đáp án rồi gắn số câu
              </label>
              <RichTextEditor
                value={transcript}
                onChange={setTranscript}
                placeholder="Nhập transcript…"
                minHeight={160}
                answerSpans={{ numbers: existingNumbers }}
              />
            </div>
          )}

          <div className="flex flex-col gap-4">
            <label className="block text-sm font-medium text-ink-700">Nhóm câu hỏi</label>
            {groups.map((g, i) => (
              <RLGroupEditor
                key={g._key}
                group={g}
                existingNumbers={existingNumbers}
                onChange={(ng) => setGroups((gs) => gs.map((x, idx) => (idx === i ? ng : x)))}
                onRemove={() => setGroups((gs) => gs.filter((_, idx) => idx !== i))}
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGroups((gs) => [...gs, emptyGroup("gap_fill")])}
            >
              Thêm nhóm
            </Button>
          </div>

          {formError && (
            <p
              data-testid="rl-question-editor-error"
              className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700"
            >
              {formError}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            data-testid="rl-question-editor-save"
            type="submit"
            disabled={mutation.isPending || uploadingAudio}
          >
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
