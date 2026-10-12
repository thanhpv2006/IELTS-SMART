"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { aiImportApi } from "./api";
import { AnswerTablePanel } from "./answer-table-panel";
import { AuditPanel } from "./audit-panel";
import { CheckpointProblems } from "./checkpoint-problems";
import { ClassificationPanel } from "./classification-panel";
import {
  SkillPreviewOverlay,
  type SkillPreviewMode,
} from "@/features/preview/skill-preview-overlay";
import { STATUS_LABEL, STATUS_TONE } from "./status";
import { SWDraftForm } from "./sw-draft-form";
import type { AIImportJob, AIImportQuestionDraft, AIImportRegion, AIImportResult } from "./types";
import { RLQuestionEditor } from "@/features/catalog/rl-question-editor";
import type { CatalogQuestion, CatalogSkill } from "@/features/catalog/types";
import { errorMessage } from "@/lib/api/errors";
import { cn, stripHtml } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type RLSkill = "reading" | "listening";

const SKILL_ORDER: readonly string[] = ["listening", "reading", "writing", "speaking"];

const SKILL_LABEL: Record<string, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

const SOURCE_LABEL: Record<string, string> = {
  listening: "Đề Listening — bản OCR",
  reading: "Đề Reading — bản OCR",
};

type Tab = "questions" | "source";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRLSkill(skill: string): skill is RLSkill {
  return skill === "reading" || skill === "listening";
}

function safeQuestions(job: AIImportJob): AIImportQuestionDraft[] {
  const raw = Array.isArray(job.result?.questions) ? job.result.questions : [];
  return raw.map((draft) => ({ ...draft, metadata: isRecord(draft.metadata) ? draft.metadata : {} }));
}

function safeSourceMarkdown(job: AIImportJob): Record<string, string> {
  const raw: unknown = job.result?.source_markdown;
  if (!isRecord(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Item numbers a draft covers, read defensively from unvalidated AI metadata. */
function draftItemNumbers(metadata: Record<string, unknown>): number[] {
  const groups = metadata.groups;
  if (!Array.isArray(groups)) return [];
  const numbers: number[] = [];
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.items)) continue;
    for (const item of group.items) {
      if (isRecord(item) && typeof item.number === "number") numbers.push(item.number);
    }
  }
  return numbers.sort((a, b) => a - b);
}

// Every QC finding names a question NUMBER, so a draft row that showed only its part would leave
// the reviewer unable to tell which card a flagged number lives in.
function itemRangeLabel(metadata: Record<string, unknown>): string {
  const numbers = draftItemNumbers(metadata);
  if (numbers.length === 0) return "chưa có câu nào";
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  return first === last ? `câu ${first}` : `câu ${first}–${last}`;
}

// RLQuestionEditor reads only part/prompt/metadata/category_id off `question` (skill arrives as
// its own prop); the remaining fields exist to satisfy CatalogQuestion and are never read.
function draftToSeedQuestion(draft: AIImportQuestionDraft, id: string): CatalogQuestion {
  return {
    id,
    skill: draft.skill as CatalogSkill,
    part: draft.part,
    prompt: draft.prompt,
    metadata: draft.metadata,
    status: "draft",
    owner_kind: "partner",
    created_at: "",
    updated_at: "",
  };
}

/** Cache key for one AI import job, shared with the page that polls the job. */
export function aiImportJobQueryKey(jobId: string) {
  return ["ai-import-job", jobId] as const;
}

export interface ReviewScreenProps {
  job: AIImportJob;
}

export function ReviewScreen({ job }: ReviewScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = aiImportJobQueryKey(job.id);

  const jobQuery = useQuery({
    queryKey,
    queryFn: () => aiImportApi.get(job.id),
    initialData: job,
  });
  const activeJob = jobQuery.data;

  const [tab, setTab] = useState<Tab>("questions");
  const [questions, setQuestions] = useState<AIImportQuestionDraft[]>(() => safeQuestions(activeJob));
  const [editing, setEditing] = useState<{ index: number; skill: RLSkill } | null>(null);
  const [preview, setPreview] = useState<{ mode: SkillPreviewMode; skill: string } | null>(null);

  // Saving rewrites every answer_key from the source answer document server-side, so the returned
  // copy can differ from what was sent — the server version has to replace the local draft list,
  // not merge with it. Done during render rather than in an effect so the reviewer never sees one
  // paint of the superseded draft.
  const [hydratedAt, setHydratedAt] = useState(activeJob.updated_at);
  if (activeJob.updated_at !== hydratedAt) {
    setHydratedAt(activeJob.updated_at);
    setQuestions(safeQuestions(activeJob));
    setEditing(null);
    setPreview(null);
  }

  const saveMutation = useMutation({
    mutationFn: (result: AIImportResult) => aiImportApi.updateResult(job.id, { result }),
    // The PATCH response already carries the re-asserted answer keys; writing it into the cache
    // before the refetch lands is what stops the editor from repainting the superseded draft.
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => aiImportApi.confirm(job.id),
    onSuccess: () => router.push("/banks"),
  });

  // Confirming the classification is what enqueues the build phase; the job then moves on its
  // own, so the refetch is what swaps this screen over to the draft.
  const classificationMutation = useMutation({
    mutationFn: (regions: AIImportRegion[]) => aiImportApi.confirmClassification(job.id, regions),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const sourceMarkdown = safeSourceMarkdown(activeJob);
  const reviewable = activeJob.status === "ready_for_review";
  const atCheckpoint = activeJob.status === "awaiting_confirm";
  const inventory = Array.isArray(activeJob.inventory) ? activeJob.inventory : [];
  const audit = Array.isArray(activeJob.audit) ? activeJob.audit : [];
  const busy = saveMutation.isPending || confirmMutation.isPending;

  const updateQuestion = (index: number, next: AIImportQuestionDraft) => {
    setQuestions((qs) => qs.map((q, i) => (i === index ? next : q)));
  };

  const handleSave = () => {
    saveMutation.mutate({
      slug: activeJob.result?.slug || activeJob.slug,
      name: activeJob.result?.name || activeJob.name,
      questions,
      source_markdown: sourceMarkdown,
    });
  };

  const rows = questions.map((draft, index) => ({ draft, index }));
  const unknownSkillRows = rows.filter((row) => !SKILL_ORDER.includes(row.draft.skill));
  const editingDraft = editing ? questions[editing.index] : undefined;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg font-bold tracking-tight text-ink-900">{activeJob.name || activeJob.slug}</h2>
          <Badge tone={STATUS_TONE[activeJob.status]}>{STATUS_LABEL[activeJob.status]}</Badge>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          {activeJob.slug} ·{" "}
          {atCheckpoint ? `${inventory.length} file đã tải lên` : `${questions.length} câu hỏi nháp`}
        </p>
      </div>
      {!atCheckpoint && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="ai-import-save"
            disabled={!reviewable || busy}
            onClick={handleSave}
          >
            {saveMutation.isPending ? "Đang lưu…" : "Lưu bản sửa"}
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="ai-import-confirm"
            disabled={!reviewable || busy}
            onClick={() => confirmMutation.mutate()}
          >
            {confirmMutation.isPending ? "Đang tạo đề…" : "Tạo đề"}
          </Button>
        </div>
      )}
    </div>
  );

  const jobError = activeJob.error && (
    <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{activeJob.error}</p>
  );

  if (atCheckpoint) {
    return (
      <div className="flex flex-col gap-5">
        {header}
        {jobError}
        {classificationMutation.isError && (
          <p
            data-testid="ai-import-classification-error"
            className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700"
          >
            {errorMessage(classificationMutation.error)}
          </p>
        )}
        <CheckpointProblems problems={activeJob.classification_problems ?? []} />
        <ClassificationPanel
          inventory={inventory}
          submitting={classificationMutation.isPending}
          onConfirm={(regions) => classificationMutation.mutate(regions)}
        />
        <AnswerTablePanel table={activeJob.answer_table} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {header}
      {jobError}
      {saveMutation.isError && (
        <p data-testid="ai-import-save-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
          {errorMessage(saveMutation.error)}
        </p>
      )}
      {confirmMutation.isError && (
        <p data-testid="ai-import-confirm-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
          {errorMessage(confirmMutation.error)}
        </p>
      )}
      {activeJob.status === "done" && (
        <p className="rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">
          Bản nháp này đã được tạo thành đề thật, không sửa được nữa.
        </p>
      )}

      {audit.length > 0 && <AuditPanel findings={audit} />}

      <div className="flex flex-wrap gap-2 border-b border-ink-200">
        {(
          [
            ["questions", `Câu hỏi (${questions.length})`],
            ["source", "Đề gốc"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            data-testid={`ai-import-tab-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === key ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "questions" ? (
        <div className="flex flex-col gap-6">
          {rows.length === 0 && (
            <p className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-400">
              Chưa có câu hỏi nháp nào — job chưa soạn xong.
            </p>
          )}

          {SKILL_ORDER.map((skill) => {
            const skillRows = rows.filter((row) => row.draft.skill === skill);
            if (skillRows.length === 0) return null;
            return (
              <section key={skill} className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink-800">
                    {SKILL_LABEL[skill]} <span className="font-normal text-ink-400">({skillRows.length})</span>
                  </h3>
                  {/* Deliberately not gated on `reviewable`: a job already imported still has to be
                      inspectable, and neither preview can change the draft. */}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid={`ai-import-preview-exam-${skill}`}
                      onClick={() => setPreview({ mode: "exam", skill })}
                    >
                      Xem trước đề
                    </Button>
                    {isRLSkill(skill) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid={`ai-import-preview-result-${skill}`}
                        onClick={() => setPreview({ mode: "result", skill })}
                      >
                        Xem trước đáp án
                      </Button>
                    )}
                  </div>
                </div>
                {skillRows.map(({ draft, index }) =>
                  isRLSkill(skill) ? (
                    <RLDraftRow
                      key={index}
                      draft={draft}
                      disabled={!reviewable}
                      onEdit={() => setEditing({ index, skill })}
                    />
                  ) : (
                    <div key={index} className="rounded-lg border border-ink-200 p-3">
                      <p className="mb-2 text-xs font-semibold text-ink-500">Part {draft.part}</p>
                      <SWDraftForm draft={draft} onChange={(next) => updateQuestion(index, next)} />
                    </div>
                  ),
                )}
              </section>
            );
          })}

          {unknownSkillRows.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h3 className="text-sm font-bold text-warning-700">
                Kỹ năng không hợp lệ <span className="font-normal">({unknownSkillRows.length})</span>
              </h3>
              {unknownSkillRows.map(({ draft, index }) => (
                <div key={index} className="rounded-lg border border-warning-200 bg-warning-50/50 p-3">
                  <p className="mb-2 text-xs font-semibold text-warning-700">
                    skill=&quot;{draft.skill}&quot; · part {draft.part}
                  </p>
                  <SWDraftForm draft={draft} onChange={(next) => updateQuestion(index, next)} />
                </div>
              ))}
            </section>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.keys(sourceMarkdown).length === 0 && (
            <p className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-400">
              Chưa có bản OCR của đề gốc.
            </p>
          )}
          {Object.entries(sourceMarkdown).map(([key, markdown]) => (
            <div key={key} className="overflow-hidden rounded-lg border border-ink-200">
              <p className="border-b border-ink-200 bg-ink-50 px-3 py-2 text-xs font-semibold text-ink-600">
                {SOURCE_LABEL[key] ?? key}
              </p>
              <pre className="max-h-96 overflow-auto px-3 py-2 text-xs whitespace-pre-wrap text-ink-700">
                {markdown}
              </pre>
            </div>
          ))}
        </div>
      )}

      {editing && editingDraft && (
        <RLQuestionEditor
          open
          onClose={() => setEditing(null)}
          skill={editing.skill}
          question={draftToSeedQuestion(editingDraft, String(editing.index))}
          onSubmit={async ({ metadata, prompt, part }) => {
            updateQuestion(editing.index, { ...editingDraft, metadata, prompt, part });
          }}
        />
      )}

      {preview && (
        <SkillPreviewOverlay
          mode={preview.mode}
          skill={preview.skill}
          // The in-progress list, not the server copy, so the preview reflects edits made since
          // the last save.
          questions={questions}
          note="Bản nháp chưa lưu — thao tác ở đây không được chấm và không thay đổi đề."
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function RLDraftRow({
  draft,
  disabled,
  onEdit,
}: {
  draft: AIImportQuestionDraft;
  disabled: boolean;
  onEdit: () => void;
}) {
  const preview = stripHtml(draft.prompt).slice(0, 180);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-800">
          Part {draft.part} · {itemRangeLabel(draft.metadata)}
        </p>
        <p className="truncate text-xs text-ink-500">{preview || "(chưa có nội dung)"}</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onEdit}>
        Sửa
      </Button>
    </div>
  );
}
