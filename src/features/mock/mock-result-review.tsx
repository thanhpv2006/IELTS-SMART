"use client";

// Teacher review modal for a multi-skill Mock Test result. This is the ONLY
// place a mock's band gets recomputed on save: the backend's recompute/gate
// logic only understands the flat single-skill shape, so for a nested mock
// result `SaveReview` stores whatever top-level `overall_band` we send,
// verbatim. See mock-band.ts for the recompute rules (mirrors backend
// roundHalf) and mock-result-types.ts for the payload shape.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resultApi } from "@/features/partner/api";
import type { SpeakingResult } from "@/features/partner/result-types";
import type { WritingResult } from "@/features/writing/writing-result-types";
import { mockScoresComplete, recomputeOverall, recomputeSkillBand } from "./mock-band";
import { isMockResult, type MockResultPayload, type MockSkillResult } from "./mock-result-types";
import { ObjectiveResultView, isObjectiveResult } from "@/features/take/objective-result-view";
import { MockResultView } from "./mock-result-view";
import { SpeakingGradingPanel, WritingGradingPanel } from "@/features/review/skill-grading-panel";
import { ViolationsSection } from "@/features/review/violations-section";
import { SpeakingFraudPanel } from "@/features/review/speaking-fraud-panel";
import { answersFromMockSkill } from "./mock-answers";

type SkillKey = "reading" | "listening" | "speaking" | "writing";

const SKILLS: SkillKey[] = ["reading", "listening", "speaking", "writing"];

const SKILL_LABEL: Record<SkillKey, string> = {
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
};

function bandColor(b: number | null | undefined): string {
  if (typeof b !== "number") return "text-ink-400";
  if (b >= 7) return "text-green-600";
  if (b >= 5.5) return "text-brand-500";
  if (b >= 4) return "text-yellow-600";
  return "text-red-500";
}

function formatBand(b: number | null | undefined): string {
  // A graded objective skill can legitimately be band 0.0 (0 correct answers —
  // product rule, see fulltest_zero_raw_band migration). Only a non-numeric band
  // means "not scored"; 0 must render as "0.0", not "Chưa chấm".
  return typeof b === "number" ? b.toFixed(1) : "Chưa chấm";
}

/**
 * Build the payload that will actually be sent to the backend: recompute
 * Speaking + Writing skill bands from their (possibly teacher-edited)
 * criteria, write the band into BOTH `skills.<skill>.band` and the nested
 * `skills.<skill>.result.overall_band`, then recompute the top-level
 * `overall_band` from all 4 skill bands. Always recomputing S/W (not just
 * "touched" skills) is deliberately a superset of the minimum requirement —
 * it's idempotent when nothing changed and guarantees the saved band can
 * never drift from the criteria actually stored.
 */
function buildRecomputedPayload(state: MockResultPayload): MockResultPayload {
  const next: MockResultPayload = structuredClone(state);
  for (const skill of ["speaking", "writing"] as const) {
    const entry = next.skills[skill];
    // Skill wasn't scored (failed / never submitted) — nothing to recompute,
    // leave `entry.band` as-is instead of dereferencing a null result.
    if (entry.result == null) continue;
    const result = entry.result as SpeakingResult | WritingResult;
    const band = recomputeSkillBand(result, skill);
    entry.band = band;
    result.overall_band = band;
  }
  next.overall_band = recomputeOverall(next);
  return next;
}

export function MockResultReview({ resultId, onClose }: { resultId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["results", resultId],
    queryFn: () => resultApi.get(resultId),
  });

  const [editState, setEditState] = useState<MockResultPayload | null>(null);
  const [tab, setTab] = useState<SkillKey>("reading");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Seed local editable state once the result loads — deep clone so edits
  // never mutate the TanStack Query cache directly.
  useEffect(() => {
    if (data && isMockResult(data.result)) {
      setEditState(structuredClone(data.result));
    }
  }, [data]);

  const previewPayload = useMemo(
    () => (editState ? buildRecomputedPayload(editState) : null),
    [editState],
  );
  const canApprove = previewPayload ? mockScoresComplete(previewPayload) : false;
  // Governance: once a mock result is approved it's locked — re-approving would
  // re-fire release side effects (mirrors the flat review flow's `if (!approved)`).
  const approved = data?.review_status === "approved";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["results"] });

  // "Cập nhật": saves the graded version (reviewed_result) and KEEPS it pending — the student does NOT see it yet.
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editState) throw new Error("Chưa có dữ liệu để lưu.");
      await resultApi.review(resultId, { reviewed_result: buildRecomputedPayload(editState) });
    },
    onSuccess: invalidate,
    onError: invalidate,
  });

  // "Chốt kết quả": save the graded version then approve — released to the student and locked for good.
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!editState) throw new Error("Chưa có dữ liệu để lưu.");
      await resultApi.review(resultId, { reviewed_result: buildRecomputedPayload(editState) });
      if (!approved) await resultApi.approve(resultId);
    },
    onSuccess: () => {
      invalidate();
      setConfirmOpen(false);
      onClose();
    },
    onError: invalidate,
  });

  const updateSkillResult = (skill: "speaking" | "writing", next: SpeakingResult | WritingResult) => {
    setEditState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        skills: { ...prev.skills, [skill]: { ...prev.skills[skill], result: next } },
      };
    });
  };

  // Live band shown per-tab: recomputed for S/W (reflects unsaved edits),
  // untouched for R/L (teacher never edits objective skills here).
  const displayBand = (skill: SkillKey): number | null | undefined => {
    if (!editState) return undefined;
    if ((skill === "speaking" || skill === "writing") && previewPayload) {
      return previewPayload.skills[skill].band;
    }
    return editState.skills[skill].band;
  };
  const displayOverall = previewPayload?.overall_band ?? editState?.overall_band;

  return (
    <div className="fixed inset-0 z-50 bg-ink-900/55">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl">
        <header className="flex h-[86px] shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="icon" className="size-11 rounded-lg" onClick={onClose} aria-label="Quay lại">
              <ArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-ink-900">
                Review Mock Test — {data?.student_name || "Học viên"}
              </h1>
              <p className="mt-0.5 truncate text-sm leading-5 text-ink-500">
                4 kỹ năng
                {typeof displayOverall === "number" ? ` · Band tổng ${displayOverall.toFixed(1)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {!approved && (
              <div className="hidden items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-1.5 sm:flex">
                <span className={cn("text-xl font-bold num", bandColor(displayOverall))}>
                  {typeof displayOverall === "number" ? displayOverall.toFixed(1) : "—"}
                </span>
                <span className="text-xs font-semibold leading-tight text-ink-500">
                  Band tổng
                  <br />
                  Mock Test
                </span>
              </div>
            )}
            <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}>
              <X className="size-5" />
            </Button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ink-50">
          {isLoading && <p className="p-6 text-center text-sm text-ink-500">Đang tải...</p>}
          {isError && <p className="p-6 text-center text-sm text-error-700">Không tải được kết quả.</p>}

          {!isLoading && !isError && data && isMockResult(data.result) && (data.violations?.total || data.fraud) && (
            <div className="max-h-[35vh] shrink-0 overflow-y-auto px-5 pt-4">
              <ViolationsSection violations={data.violations} />
              <SpeakingFraudPanel fraud={data.fraud} />
            </div>
          )}

          {!isLoading && !isError && data && !isMockResult(data.result) && (
            <p className="m-5 rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-500">
              Kết quả này không phải bài Mock Test nhiều kỹ năng — hãy dùng màn review thông thường.
            </p>
          )}

          {!isLoading && !isError && data && isMockResult(data.result) && editState && approved && (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <MockResultView result={editState} audience="partner" />
            </div>
          )}

          {!isLoading && !isError && data && isMockResult(data.result) && editState && !approved && (
            <>
              {/* Skill tabs — fixed strip; Reading/Listening scroll below, Speaking/Writing
                  panels fill the full modal body like the standalone grading screen. */}
              <div className="shrink-0 px-5 pt-4 pb-3">
                <div className="flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1">
                  {SKILLS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => setTab(skill)}
                      className={cn(
                        "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                        tab === skill ? "bg-white text-brand-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                      )}
                    >
                      {SKILL_LABEL[skill]} <span className={bandColor(displayBand(skill))}>· {formatBand(displayBand(skill))}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {tab === "reading" && (
                  <div className="h-full overflow-y-auto px-5 pb-5">
                    <ReadOnlySkillTab skill="reading" data={editState.skills.reading} />
                  </div>
                )}
                {tab === "listening" && (
                  <div className="h-full overflow-y-auto px-5 pb-5">
                    <ReadOnlySkillTab skill="listening" data={editState.skills.listening} />
                  </div>
                )}
                {tab === "speaking" && (
                  <SpeakingReviewTab
                    skillState={editState.skills.speaking}
                    onChange={(next) => updateSkillResult("speaking", next)}
                  />
                )}
                {tab === "writing" && (
                  <WritingReviewTab
                    skillState={editState.skills.writing}
                    onChange={(next) => updateSkillResult("writing", next)}
                  />
                )}
              </div>
            </>
          )}
        </main>

        {!isLoading && !isError && data && isMockResult(data.result) && editState && (
          <footer className="flex h-[78px] shrink-0 items-center justify-end gap-3 border-t border-ink-100 bg-white px-4 py-4 sm:px-8">
            {approved ? null : updateMutation.isError || finalizeMutation.isError ? (
              <span className="mr-auto hidden text-sm font-medium text-error-700 sm:inline">Lưu thất bại, thử lại.</span>
            ) : !canApprove ? (
              <span className="mr-auto hidden text-sm font-medium text-amber-700 sm:inline">
                Cần chấm đủ điểm từng tiêu chí của Speaking/Writing (kể cả Task 1 + Task 2) trước khi lưu.
              </span>
            ) : updateMutation.isSuccess ? (
              <span className="mr-auto hidden text-sm font-medium text-green-700 sm:inline">Đã lưu bản chấm (chưa hiển thị cho học viên).</span>
            ) : null}
            <Button variant="outline" className="h-11 min-w-[100px]" onClick={onClose}>
              Đóng
            </Button>
            {!approved && (
              <>
                <Button
                  variant="outline"
                  data-testid="update-mock-result-btn"
                  className="h-11 min-w-[120px]"
                  onClick={() => updateMutation.mutate()}
                  disabled={!canApprove || updateMutation.isPending || finalizeMutation.isPending}
                >
                  {updateMutation.isPending ? "Đang lưu..." : "Cập nhật"}
                </Button>
                <Button
                  data-testid="save-mock-result-btn"
                  className="h-11 min-w-[160px]"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canApprove || updateMutation.isPending || finalizeMutation.isPending}
                >
                  <Check className="size-4" /> Chốt kết quả
                </Button>
              </>
            )}
          </footer>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Chốt kết quả?"
        description="Sau khi chốt, kết quả sẽ hiển thị cho học viên và bạn không sửa lại được."
        size="sm"
      >
        <div className="flex justify-end gap-3 px-6 py-4">
          <Button variant="outline" className="h-11 min-w-[100px]" onClick={() => setConfirmOpen(false)}>
            Hủy
          </Button>
          <Button
            data-testid="finalize-confirm-btn"
            className="h-11 min-w-[140px]"
            onClick={() => finalizeMutation.mutate()}
            disabled={finalizeMutation.isPending}
          >
            <Check className="size-4" /> {finalizeMutation.isPending ? "Đang chốt..." : "Chốt kết quả"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function ReadOnlySkillTab({ skill, data }: { skill: "reading" | "listening"; data: MockSkillResult }) {
  // New objective shape: ObjectiveResultView owns the band circle + per-question
  // detail, so we only add the read-only note above it (no duplicate band header).
  if (isObjectiveResult(data.result)) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-ink-400">IELTS {SKILL_LABEL[skill]} — giáo viên không chỉnh sửa kỹ năng khách quan.</p>
        <ObjectiveResultView result={data.result} showBand />
      </div>
    );
  }
  // Legacy result (no kind/sections): band header + aggregate stat chips (or nothing).
  const detail = extractObjectiveDetail(data.result);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className={cn("text-3xl font-bold num", bandColor(data.band))}>{formatBand(data.band)}</span>
        <div>
          <p className="font-semibold text-ink-800">Band {SKILL_LABEL[skill]}</p>
          <p className="text-xs text-ink-400">IELTS {SKILL_LABEL[skill]} — giáo viên không chỉnh sửa kỹ năng khách quan.</p>
        </div>
      </div>
      {detail ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {detail.correct != null && detail.total != null && (
            <StatChip label="Số câu đúng" value={`${detail.correct}/${detail.total}`} />
          )}
          {detail.rawScore != null && <StatChip label="Điểm thô" value={String(detail.rawScore)} />}
        </div>
      ) : (
        <p className="text-sm text-ink-500">Chưa có chi tiết theo câu hỏi cho kỹ năng này.</p>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      <p className="text-lg font-bold text-ink-900 num">{value}</p>
    </div>
  );
}

interface ObjectiveDetail {
  correct?: number;
  total?: number;
  rawScore?: number;
}

// R/L result shape is not standardized on the FE (`MockSkillResult.result` is
// `unknown`) — probe a few likely field names and degrade to "band only" if
// none are present, rather than assuming a schema and crashing.
function extractObjectiveDetail(raw: unknown): ObjectiveDetail | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const correct = pickNumber(r, ["correct_count", "correct", "num_correct"]);
  const total = pickNumber(r, ["total_questions", "total", "question_count"]);
  const rawScore = pickNumber(r, ["raw_score", "score"]);
  if (correct == null && total == null && rawScore == null) return null;
  return { correct: correct ?? undefined, total: total ?? undefined, rawScore: rawScore ?? undefined };
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

// ─── Speaking (editable) ─────────────────────────────────────────────────────
// Shared 3-column grading panel (band summary + answers + AI feedback/errors) —
// same body as the standalone review page. Mock has no per-skill gate, so no
// `blankScores`. See design D5 / mock-answers.ts for the answers synth.

function SpeakingReviewTab({
  skillState,
  onChange,
}: {
  skillState: MockSkillResult;
  onChange: (next: SpeakingResult) => void;
}) {
  // Skill never scored (failed / not submitted) → nothing to grade, don't render
  // an empty editable panel (which would also stub-write a 0 band on mount).
  if (skillState.result == null) {
    return <p className="p-6 text-sm text-ink-500">Chưa có dữ liệu Speaking.</p>;
  }
  const result = skillState.result as SpeakingResult;
  // Fill the modal body (flex-col) so the panel's own columns scroll — full-screen
  // grading like the standalone Speaking review, not a boxed sub-panel.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SpeakingGradingPanel
        result={result}
        answers={answersFromMockSkill(result, "speaking")}
        readOnly={false}
        onChange={onChange}
      />
    </div>
  );
}

// ─── Writing (editable) ──────────────────────────────────────────────────────
// Mock Writing shares the exact same panel as standalone review. A full mock's
// Writing is normally multi-task (Task 1 + Task 2); the panel edits ONE task at a
// time via the controlled `activeIdx`, so we render a Task switcher here (mirrors
// the standalone modal, which owns the task tabs above the panel). Single-task
// (flat) Writing shows no switcher.

function WritingReviewTab({
  skillState,
  onChange,
}: {
  skillState: MockSkillResult;
  onChange: (next: WritingResult) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  if (skillState.result == null) {
    return <p className="p-6 text-sm text-ink-500">Chưa có dữ liệu Writing.</p>;
  }
  const result = skillState.result as WritingResult;
  const tasks = result.multi_task && result.tasks?.length ? result.tasks : [];
  const taskLabel = (t: WritingResult, i: number) =>
    t.task_type === "Task1" ? "Task 1" : t.task_type === "Task2" ? "Task 2" : `Task ${i + 1}`;
  const idx = Math.min(activeIdx, Math.max(0, tasks.length - 1));
  // Fill the modal body; the panel's columns scroll internally (full-screen like
  // the standalone Writing review). Task switcher is a fixed strip above it.
  return (
    <div className="flex h-full min-h-0 flex-col">
      {tasks.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-2 px-5 pt-1 pb-3">
          {tasks.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                idx === i
                  ? "border-brand-200 bg-brand-50 text-brand-600"
                  : "border-ink-200 bg-white text-ink-500 hover:text-ink-800",
              )}
            >
              {taskLabel(t, i)}
            </button>
          ))}
        </div>
      )}
      <WritingGradingPanel
        result={result}
        answers={answersFromMockSkill(result, "writing")}
        readOnly={false}
        activeIdx={idx}
        onChange={onChange}
      />
    </div>
  );
}
