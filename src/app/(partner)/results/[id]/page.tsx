"use client";

import { use, createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Edit3, X } from "lucide-react";
import { resultApi, type AnswerItem, type AssignmentResult, type ResultGate } from "@/features/partner/api";
import { studentResultApi } from "@/features/student/api";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SpeakingResult, ConfidenceBlock } from "@/features/partner/result-types";
import type { WritingResult } from "@/features/writing/writing-result-types";
import { isMockResult } from "@/features/mock/mock-result-types";
import { MockResultReview } from "@/features/mock/mock-result-review";
import { ObjectiveResultView, isObjectiveResult, objectiveSkillLabel } from "@/features/take/objective-result-view";
import { SPEAKING_CRITERIA, WRITING_CRITERIA, StudentContext, criteriaComplete } from "@/features/review/grading-shared";
import { SpeakingGradingPanel, WritingGradingPanel } from "@/features/review/skill-grading-panel";
import { ManualGradingTag } from "@/features/assignments/manual-grading-tag";
import { ViolationsSection } from "@/features/review/violations-section";

function isWritingResult(value: unknown): value is WritingResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  // Single-task writing markers plus multi-task (only multi_task/tasks at the top level).
  if ("task_type" in v || "word_count" in v || "clean_essay" in v || "multi_task" in v || "tasks" in v) return true;
  // Writing criteria (TA_TR/CC) tell it apart from Speaking (FC/PRON).
  const crit = v.criteria as Record<string, unknown> | undefined;
  return !!crit && ("TA_TR" in crit || "CC" in crit);
}

// The most reliable skill signal comes from the answer: Writing has essay_text, Speaking has audio.
function answersAreWriting(answers?: AnswerItem[]): boolean {
  if (!answers || answers.length === 0) return false;
  return answers.some((a) => !!a.essay_text && !a.audio_url);
}

// onClose is shared by every "close"/back button in the modal (a route pushes back to
// /assignments, a dialog just closes) — avoiding prop-drilling through the footers.
const CloseContext = createContext<() => void>(() => {});

// Shell shared by 2 entry points: `ResultReviewModal` (teacher/centre, scoring +
// approval) and `StudentResultView` (student, view only). They stay two public components
// so both sides can evolve separately, while the review layout has a single source so they never drift.
function ReviewShell({ id, onClose, audience }: { id: string; onClose: () => void; audience: "teacher" | "student" }) {
  const isStudent = audience === "student";
  const qc = useQueryClient();
  const teacherQ = useQuery({
    queryKey: ["results", id],
    queryFn: () => resultApi.get(id),
    enabled: !isStudent,
  });
  const studentQ = useQuery({
    queryKey: ["student-result", id],
    queryFn: () => studentResultApi.get(id),
    enabled: isStudent,
  });
  const result = (isStudent ? studentQ.data : teacherQ.data) as AssignmentResult | undefined;
  const isLoading = isStudent ? studentQ.isLoading : teacherQ.isLoading;

  const approve = useMutation({
    mutationFn: () => resultApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["results", id] });
      qc.invalidateQueries({ queryKey: ["results"] });
    },
  });

  // Sau khi review xong: tab "Giáo viên review" (false) vs "AI chấm" (true).
  const [aiView, setAiView] = useState(false);
  // Multi-task writing: a tab to pick Task 1/Task 2 (on the same level as the compare tabs).
  const [activeTaskIdx, setActiveTaskIdx] = useState(0);
  // A gated-pass attempt opens in view mode (AI read-only); the teacher clicks "Chỉnh sửa" to
  // switch to editing. A gated-fail attempt is always in edit mode (see `editing` below).
  const [editingOverride, setEditingOverride] = useState(false);

  if (isLoading) return <p className="p-6 text-sm text-ink-500">Đang tải...</p>;
  if (!result) return <p className="p-6 text-sm text-error-700">Không tìm thấy kết quả.</p>;

  // Reading/Listening (objective): rendered read-only — scored and released automatically, with no
  // approval or manual-scoring step like Speaking/Writing. Patched in exactly one shared place so both `ResultReviewModal`
  // (teacher) and `StudentResultView` (student) render correctly instead of falling into the Speaking branch
  // (a blank screen).
  if (isObjectiveResult(result.result)) {
    return <ObjectiveReviewModal result={result} audience={audience} onClose={onClose} />;
  }

  const parsed = result.result as SpeakingResult | WritingResult | null;
  const aiParsed = (result.ai_result ?? null) as SpeakingResult | WritingResult | null;
  // Prefer `skill` from BE (authoritative); fall back to the answer (essay vs audio), then the result shape.
  const isWriting = result.skill === "writing" || (result.skill !== "speaking" && (answersAreWriting(result.answers) || isWritingResult(parsed)));
  const approved = result.review_status === "approved";
  const manual = result.grading_mode === "manual";
  const headBand = !isWriting ? (parsed as SpeakingResult | null)?.overall_band ?? (parsed as SpeakingResult | null)?.overall_feedback?.final_band : (parsed as WritingResult | null)?.overall_band;
  // Students never see the AI confidence warning (that signal is for the reviewing teacher).
  const conf = (!isWriting && !isStudent && !manual) ? (parsed as SpeakingResult | null)?.confidence : undefined;
  // Confidence gate (Speaking + Writing, teacher side only). gated-fail → hide the
  // AI score, open edit mode, block approval until every score is filled. gated-pass → view the AI
  // read-only first. Multi-task writing: decided per task at gate.tasks[].
  const gate = !isStudent ? result.gate : undefined;
  const gateFailed = gate?.status === "fail";
  const isGated = gate != null;
  // Approved → fully locked: no edit mode, no update button. Only an unapproved
  // attempt is editable (non-gated always is; gated opens on fail or after clicking "Chỉnh sửa").
  const editing = approved ? false : (!isGated ? true : (gateFailed || editingOverride));
  const notReviewed = !result.reviewed_at;
  // Speaking (flat): leave the AI score blank when gated-fail and never reviewed.
  const blankScores = gateFailed && notReviewed;
  // Show 2 tabs once reviewed and the original AI version differs from the teacher's edit — teacher side only.
  const hasAiCompare = !isStudent && !manual && approved && !!aiParsed && JSON.stringify(aiParsed) !== JSON.stringify(parsed);
  const showAi = hasAiCompare && aiView;
  const wrParsed = isWriting ? (parsed as WritingResult | null) : null;
  const taskCount = wrParsed?.multi_task && wrParsed.tasks?.length ? wrParsed.tasks.length : 1;

  const pageFooter = (
    <footer className="flex h-[78px] shrink-0 justify-end gap-3 border-t border-ink-100 bg-white px-4 py-4 sm:px-8">
      <Button variant="outline" className="h-11 min-w-[112px]" onClick={onClose}>Đóng</Button>
      {!approved && (
        <Button className="h-11 min-w-[190px]" onClick={() => approve.mutate()} disabled={approve.isPending}>
          <Check className="size-4" /> {approve.isPending ? "Đang chốt..." : "Chốt kết quả"}
        </Button>
      )}
    </footer>
  );

  return (
    <StudentContext.Provider value={isStudent}>
    <CloseContext.Provider value={onClose}>
    <div className="fixed inset-0 z-50 bg-ink-900/55 p-0 sm:p-3">
      <div className="mx-auto flex h-full max-w-[1980px] flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:rounded-[22px]">
        <header className="flex h-[86px] shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="icon" className="size-11 rounded-lg" onClick={onClose} aria-label="Quay lại bài tập">
              <ArrowLeft className="size-4" />
            </Button>
            <AvatarInitials name={result.student_name || "Học viên"} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-bold text-ink-900">{isStudent ? "Kết quả bài thi" : result.student_name || "Học viên"}</h1>
                {!isStudent && <StatusPill approved={approved} />}
                <span className={cn("rounded-full border px-3 py-0.5 text-xs font-semibold", isWriting ? "border-warning-200 bg-warning-50 text-warning-700" : "border-brand-200 bg-brand-50 text-brand-600")}>
                  {isWriting ? `Writing ${(parsed as WritingResult | null)?.task_type ? (parsed as WritingResult).task_type!.replace("Task", "Task ") : ""}` : "Speaking"}
                </span>
                {manual && !isStudent && <ManualGradingTag />}
                {!manual && gate && <GateWarningChip gate={gate} />}
              </div>
              <p className="mt-0.5 truncate text-sm leading-5 text-ink-500">
                {isWriting ? "Writing" : "Speaking"}
                {typeof headBand === "number" ? ` · IELTS ${headBand.toFixed(1)}` : ""}
                {" · Nộp lúc "}
                {new Date(result.created_at).toLocaleString("vi-VN")}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </header>

        {!gate && <LowConfidenceBanner conf={conf} />}
        {!isStudent && result.violations && result.violations.total > 0 && (
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <ViolationsSection violations={result.violations} />
          </div>
        )}

        {(hasAiCompare || taskCount > 1) && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-ink-100 bg-white px-4 pt-2 sm:px-6">
            <div className="flex items-center gap-1">
              {hasAiCompare && (
                <>
                  <CompareTab active={!aiView} onClick={() => setAiView(false)} label="Giáo viên review" testId="teacher-compare-tab" />
                  <CompareTab active={aiView} onClick={() => setAiView(true)} label="AI chấm" testId="ai-compare-tab" />
                </>
              )}
            </div>
            {taskCount > 1 && (
              <div className="flex items-center gap-2 pb-1.5">
                {Array.from({ length: taskCount }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveTaskIdx(i)}
                    className={cn(
                      "rounded-lg border px-4 py-1.5 text-sm font-semibold transition-colors",
                      activeTaskIdx === i ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-500 hover:text-ink-800",
                    )}
                  >
                    Task {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {parsed ? (
          isWriting ? (
            <WritingReview
              key={showAi ? "ai" : "teacher"}
              result={(showAi ? aiParsed : parsed) as WritingResult}
              assignment={result}
              id={id}
              approved={approved}
              readOnly={showAi || isStudent}
              activeIdx={activeTaskIdx}
              editing={editing}
              gate={gate}
              gateFailed={!!gateFailed}
              notReviewed={!showAi && notReviewed}
              manual={manual}
              onEdit={() => setEditingOverride(true)}
              onApproveDirect={() => approve.mutate()}
              approvePending={approve.isPending}
            />
          ) : (
            <SpeakingReview
              key={showAi ? "ai" : "teacher"}
              result={(showAi ? aiParsed : parsed) as SpeakingResult}
              assignment={result}
              id={id}
              approved={approved}
              readOnly={showAi || isStudent}
              editing={editing}
              gateFailed={!!gateFailed}
              blankScores={!showAi && blankScores}
              manual={manual}
              onEdit={() => setEditingOverride(true)}
              onApproveDirect={() => approve.mutate()}
              approvePending={approve.isPending}
            />
          )
        ) : (
          <>
            <div className="flex flex-1 items-center justify-center bg-ink-50 text-sm text-ink-400">Kết quả chưa có dữ liệu.</div>
            {pageFooter}
          </>
        )}
      </div>
    </div>
    </CloseContext.Provider>
    </StudentContext.Provider>
  );
}

// Teacher / centre: score, correct errors, approve the result.
export function ResultReviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  return <ReviewShell id={id} onClose={onClose} audience="teacher" />;
}

// Student: view only a result the teacher approved (read-only, with the AI source hidden).
export function StudentResultView({ id, onClose }: { id: string; onClose: () => void }) {
  return <ReviewShell id={id} onClose={onClose} audience="student" />;
}

// Route /results/[id] — opens a standalone modal (direct link / refresh); closing returns to /assignments.
// A Mock Test (several skills) uses its own review shell (`MockResultReview`); it is detected
// by the structural marker `.skills` — sharing the query key with `ReviewShell` inside
// `ResultReviewModal`, so the non-mock branch costs no extra request.
export default function ResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const onClose = () => router.push("/assignments");
  const { data } = useQuery({
    queryKey: ["results", id],
    queryFn: () => resultApi.get(id),
  });

  if (data && isObjectiveResult(data.result)) {
    return <ObjectiveResultReview id={id} onClose={onClose} />;
  }
  if (data && isMockResult(data.result)) {
    return <MockResultReview resultId={id} onClose={onClose} />;
  }
  return <ResultReviewModal id={id} onClose={onClose} />;
}

// Reading/Listening: scored automatically (objective) and released to the student
// on submit — there is NO approval or manual-scoring step like Speaking/Writing. Teachers only review it.
function ObjectiveResultReview({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["results", id], queryFn: () => resultApi.get(id) });

  if (!data) return <p className="p-6 text-sm text-ink-500">Đang tải...</p>;
  if (!isObjectiveResult(data.result)) return <p className="p-6 text-sm text-error-700">Không tìm thấy kết quả.</p>;

  return <ObjectiveReviewModal result={data} audience="teacher" onClose={onClose} />;
}

// Modal chrome shared by the objective review (Reading/Listening), opened both from a direct route
// (`ObjectiveResultReview`) and from an in-app dialog (`ReviewShell`). Read-only for both
// audiences — L/R is scored and released automatically so there is no approval button; `audience` only changes the title and
// the note line. The title names the skill actually taken, never the "Reading/Listening" pair. The payload was already narrowed by `isObjectiveResult`.
function ObjectiveReviewModal({
  result,
  audience,
  onClose,
}: {
  result: AssignmentResult;
  audience: "teacher" | "student";
  onClose: () => void;
}) {
  if (!isObjectiveResult(result.result)) return null;
  const isStudent = audience === "student";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/55 p-0 sm:p-3">
      <div className="mx-auto flex min-h-full max-w-[1400px] flex-col rounded-none bg-white shadow-2xl sm:rounded-[22px]">
        <header className="flex h-[86px] shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="icon" className="size-11 rounded-lg" onClick={onClose} aria-label="Quay lại">
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="truncate text-base font-bold text-ink-900">
              {`${isStudent ? "Kết quả bài thi" : "Kết quả bài luyện"} (${objectiveSkillLabel(result.result)})`}
            </h1>
          </div>
          <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto bg-ink-50 p-5">
          <ViolationsSection violations={result.violations} />
          <ObjectiveResultView result={result.result} />
        </main>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 sm:px-6">
          {!isStudent && (
            <p className="text-sm text-ink-500">
              Reading/Listening được chấm và công bố tự động cho học viên — bạn chỉ xem lại.
            </p>
          )}
          <Button variant="outline" className="ml-auto" onClick={onClose}>Đóng</Button>
        </footer>
      </div>
    </div>
  );
}

// ─── AI confidence warning + AI/Teacher compare tabs ────────────────────────────

function isLowConfidence(conf?: ConfidenceBlock): boolean {
  if (!conf) return false;
  if (typeof conf.raw_score === "number") return conf.raw_score < 7;
  return conf.recommendation?.gate_status != null && conf.recommendation.gate_status !== "Pass";
}

function LowConfidenceBanner({ conf }: { conf?: ConfidenceBlock }) {
  if (!isLowConfidence(conf)) return null;
  return (
    <div data-testid="confidence-banner" className="flex shrink-0 items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div className="text-sm leading-relaxed text-amber-800">
        <span className="font-semibold">
          Độ tin cậy của AI thấp{typeof conf?.raw_score === "number" ? ` (${conf.raw_score.toFixed(1)}/10)` : ""} — giáo viên cần review kỹ trước khi trả kết quả.
        </span>
        {conf?.recommendation?.message && <span className="ml-1 text-amber-700">{conf.recommendation.message}</span>}
      </div>
    </div>
  );
}

// Warning chip for an attempt that did NOT pass the confidence gate: the AI was not confident enough, so it hid
// the score, so the teacher has to grade it before approving. Placed next to the skill label in the header;
// the full text lives in the tooltip (title) to keep it compact.
function GateWarningChip({ gate }: { gate: ResultGate }) {
  if (gate.status !== "fail") return null;
  const score = typeof gate.raw_score === "number" ? ` (độ tin cậy ${gate.raw_score.toFixed(1)}/10, ngưỡng ${gate.threshold.toFixed(1)})` : "";
  // Multi-task writing: spell out how many tasks fell short of confidence.
  const failCount = gate.tasks?.filter((t) => t.status === "fail").length ?? 0;
  const taskNote = gate.tasks?.length ? ` ${failCount}/${gate.tasks.length} phần chưa đủ tin cậy, điểm các phần đó đã được ẩn (phần đạt vẫn hiển thị).` : "";
  const full = `AI chưa đủ tin cậy để chấm tự động${score} — điểm AI đã được ẩn.${taskNote} Giáo viên cần tự chấm điểm thành phần và band tổng trước khi duyệt kết quả cho học viên.`;
  return (
    <span
      title={full}
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      AI chưa đủ tự tin
    </span>
  );
}

function CompareTab({ active, onClick, label, testId }: { active: boolean; onClick: () => void; label: string; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
        active ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-800",
      )}
    >
      {label}
    </button>
  );
}


// ─── Writing review (unchanged) ────────────────────────────────────────────────

function WritingReview({ result, assignment, id, approved, readOnly = false, activeIdx = 0, editing = true, gate, gateFailed = false, notReviewed = false, manual = false, onEdit, onApproveDirect, approvePending = false }: { result: WritingResult; assignment: AssignmentResult; id: string; approved: boolean; readOnly?: boolean; activeIdx?: number; editing?: boolean; gate?: ResultGate; gateFailed?: boolean; notReviewed?: boolean; manual?: boolean; onEdit?: () => void; onApproveDirect?: () => void; approvePending?: boolean }) {
  const qc = useQueryClient();
  const [built, setBuilt] = useState<WritingResult>(() => result);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["results", id] });
    qc.invalidateQueries({ queryKey: ["results"] });
  };
  // "Cập nhật": saves the review only and stays pending — the student does NOT see it yet.
  const update = useMutation({
    mutationFn: async () => { await resultApi.review(id, { reviewed_result: built }); },
    onSuccess: invalidate,
    onError: invalidate, // refetch to reconcile (e.g. approved concurrently → 409): escapes a stuck state.
  });
  // "Chốt": save the review then approve — released to the student and locked for good.
  const finalize = useMutation({
    mutationFn: async () => {
      await resultApi.review(id, { reviewed_result: built });
      if (!approved) await resultApi.approve(id);
    },
    onSuccess: invalidate,
    onError: invalidate, // refetch to reconcile (e.g. approved concurrently → 409): escapes a stuck state.
  });

  // Enough scores to save/finalize: an overall band plus all 4 criteria (> 0) on every task. Matches the backend rule.
  const canSave =
    typeof built.overall_band === "number" && built.overall_band > 0 &&
    (built.multi_task && built.tasks?.length
      ? built.tasks.every((t) => criteriaComplete(t.criteria, WRITING_CRITERIA))
      : criteriaComplete(built.criteria, WRITING_CRITERIA));

  return (
    <>
      <WritingGradingPanel
        result={result}
        answers={assignment.answers ?? []}
        readOnly={readOnly || !editing}
        activeIdx={activeIdx}
        gate={gate}
        notReviewed={notReviewed}
        manual={manual}
        onChange={setBuilt}
      />
      <GatedReviewFooter
        viewOnly={readOnly}
        editing={editing}
        approved={approved}
        gateFailed={gateFailed}
        canSave={canSave}
        updating={update.isPending}
        finalizing={finalize.isPending}
        updated={update.isSuccess}
        failed={update.isError || finalize.isError}
        onUpdate={() => update.mutate()}
        onFinalize={() => finalize.mutate()}
        onEdit={onEdit}
        onApprove={onApproveDirect}
        approvePending={approvePending}
      />
    </>
  );
}

// ─── Speaking review (editable, theo design) ─────────────────────────────────────

function SpeakingReview({ result, assignment, id, approved, readOnly = false, editing = true, gateFailed = false, blankScores = false, manual = false, onEdit, onApproveDirect, approvePending = false }: { result: SpeakingResult; assignment: AssignmentResult; id: string; approved: boolean; readOnly?: boolean; editing?: boolean; gateFailed?: boolean; blankScores?: boolean; manual?: boolean; onEdit?: () => void; onApproveDirect?: () => void; approvePending?: boolean }) {
  const qc = useQueryClient();
  const [built, setBuilt] = useState<SpeakingResult>(() => result);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["results", id] });
    qc.invalidateQueries({ queryKey: ["results"] });
  };
  // "Cập nhật": saves the review only and stays pending — the student does NOT see it yet.
  const update = useMutation({
    mutationFn: async () => { await resultApi.review(id, { reviewed_result: built }); },
    onSuccess: invalidate,
    onError: invalidate, // refetch to reconcile (e.g. approved concurrently → 409): escapes a stuck state.
  });
  // "Chốt": save the review then approve — released to the student and locked for good.
  const finalize = useMutation({
    mutationFn: async () => {
      await resultApi.review(id, { reviewed_result: built });
      if (!approved) await resultApi.approve(id);
    },
    onSuccess: invalidate,
    onError: invalidate, // refetch to reconcile (e.g. approved concurrently → 409): escapes a stuck state.
  });

  // Enough scores to save/finalize: an overall band plus all 4 criteria > 0 (matching the backend rule).
  const canSave = typeof built.overall_band === "number" && built.overall_band > 0 && criteriaComplete(built.criteria, SPEAKING_CRITERIA);

  return (
    <>
      <SpeakingGradingPanel
        result={result}
        answers={assignment.answers ?? []}
        readOnly={readOnly || !editing}
        blankScores={blankScores}
        manual={manual}
        onChange={setBuilt}
      />
      <GatedReviewFooter
        viewOnly={readOnly}
        editing={editing}
        approved={approved}
        gateFailed={gateFailed}
        canSave={canSave}
        updating={update.isPending}
        finalizing={finalize.isPending}
        updated={update.isSuccess}
        failed={update.isError || finalize.isError}
        onUpdate={() => update.mutate()}
        onFinalize={() => finalize.mutate()}
        onEdit={onEdit}
        onApprove={onApproveDirect}
        approvePending={approvePending}
      />
    </>
  );
}

// Confirmation dialog before "Chốt" (released to the student and locked for good).
// Shared by both the gated-pass branch (finalize the AI result directly) and edit mode (finalize the edited version).
function ConfirmReleaseDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Chốt kết quả?" description="Sau khi chốt, kết quả sẽ hiển thị cho học viên và bạn không sửa lại được." size="sm">
      <div className="flex justify-end gap-3 px-6 py-4">
        <Button variant="outline" className="h-11 min-w-[100px]" onClick={onClose}>Hủy</Button>
        <Button data-testid="finalize-confirm-btn" className="h-11 min-w-[140px]" onClick={onConfirm}>
          <Check className="size-4" /> Chốt kết quả
        </Button>
      </div>
    </Dialog>
  );
}

// Footer shared by the Speaking + Writing review with a confidence gate — 3 modes:
//  · viewOnly / approved: view only.
//  · !editing (gated-pass): "Chỉnh sửa" + "Chốt kết quả" (finalize the AI result directly, via confirm).
//  · editing: "Cập nhật" (review only, stays pending) + "Chốt kết quả" (review + approve, via confirm).
function GatedReviewFooter({
  viewOnly, editing, approved, gateFailed, canSave, updating, finalizing, updated, failed,
  onUpdate, onFinalize, onEdit, onApprove, approvePending,
}: {
  viewOnly: boolean; editing: boolean; approved: boolean; gateFailed: boolean;
  canSave: boolean; updating: boolean; finalizing: boolean; updated: boolean; failed: boolean;
  onUpdate: () => void; onFinalize: () => void; onEdit?: () => void; onApprove?: () => void; approvePending: boolean;
}) {
  const onClose = useContext(CloseContext);
  const isStudent = useContext(StudentContext);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Approved → view only, no further editing (same branch as the AI tab / student view).
  if (viewOnly || approved) {
    const msg = isStudent
      ? "Kết quả đã được giáo viên duyệt — chỉ xem."
      : viewOnly
        ? "Bản AI chấm gốc — chỉ xem, không chỉnh sửa."
        : "Kết quả đã đánh giá — chỉ xem.";
    return (
      <footer className="flex h-[78px] shrink-0 items-center justify-between gap-3 border-t border-ink-100 bg-white px-4 py-4 sm:px-8">
        <span className="text-sm text-ink-400">{msg}</span>
        <Button variant="outline" className="h-11 min-w-[112px]" onClick={onClose}>Đóng</Button>
      </footer>
    );
  }
  if (!editing) {
    return (
      <footer className="flex h-[78px] shrink-0 items-center justify-end gap-3 border-t border-ink-100 bg-white px-4 py-4 sm:px-8">
        <span className="mr-auto hidden text-sm text-ink-400 sm:inline">Kết quả AI đủ tin cậy — bạn có thể chốt luôn hoặc chỉnh sửa trước khi trả học viên.</span>
        <Button variant="outline" className="h-11 min-w-[112px]" onClick={onClose}>Đóng</Button>
        <Button data-testid="edit-result-btn" variant="outline" className="h-11 min-w-[140px]" onClick={onEdit}>
          <Edit3 className="size-4" /> Chỉnh sửa
        </Button>
        {!approved && (
          <Button data-testid="approve-btn" className="h-11 min-w-[170px]" onClick={() => setConfirmOpen(true)} disabled={approvePending}>
            <Check className="size-4" /> {approvePending ? "Đang chốt..." : "Chốt kết quả"}
          </Button>
        )}
        <ConfirmReleaseDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); onApprove?.(); }} />
      </footer>
    );
  }
  const busy = updating || finalizing;
  return (
    <footer className="flex h-[78px] shrink-0 items-center justify-end gap-3 border-t border-ink-100 bg-white px-4 py-4 sm:px-8">
      {updated && !failed && <span data-testid="save-success-msg" className="mr-auto hidden text-sm font-medium text-success-700 sm:inline">Đã lưu — chưa hiển thị cho học viên.</span>}
      {failed && <span className="mr-auto hidden text-sm font-medium text-error-700 sm:inline">Lưu thất bại, thử lại.</span>}
      {!updated && !failed && !canSave && (
        <span className="mr-auto hidden text-sm font-medium text-amber-700 sm:inline">
          {gateFailed ? "Nhập đủ điểm các tiêu chí và band tổng để chốt kết quả." : "Cần đủ điểm các tiêu chí và band tổng."}
        </span>
      )}
      <Button variant="outline" className="h-11 min-w-[112px]" onClick={onClose}>Đóng</Button>
      <Button data-testid="update-result-btn" variant="outline" className="h-11 min-w-[130px]" onClick={onUpdate} disabled={busy || !canSave}>
        {updating ? "Đang lưu..." : "Cập nhật"}
      </Button>
      <Button data-testid="finalize-result-btn" className="h-11 min-w-[160px]" onClick={() => setConfirmOpen(true)} disabled={busy || !canSave}>
        <Check className="size-4" /> {finalizing ? "Đang chốt..." : "Chốt kết quả"}
      </Button>
      <ConfirmReleaseDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); onFinalize(); }} />
    </footer>
  );
}

function StatusPill({ approved }: { approved: boolean }) {
  return (
    <span data-testid="result-status-pill" className={cn("rounded-full border px-3 py-0.5 text-xs font-semibold", approved ? "border-success-200 bg-success-50 text-success-700" : "border-warning-200 bg-warning-50 text-warning-700")}>
      {approved ? "Đã đánh giá" : "Chờ đánh giá"}
    </span>
  );
}
