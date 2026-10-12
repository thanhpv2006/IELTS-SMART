"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import type { Assignment, AssignmentResult, ResultGate } from "@/features/partner/api";
import { SUBMITTED } from "@/features/partner/assignment-groups";
import { ManualGradingTag } from "@/features/assignments/manual-grading-tag";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Pagination } from "@/components/ui/search-pagination";
import { ResultReviewModal } from "@/app/(partner)/results/[id]/page";
import { isMockResult } from "@/features/mock/mock-result-types";
import { resultScoreLabel } from "@/features/results/score-label";
import { MockResultReview } from "@/features/mock/mock-result-review";

const PAGE_SIZE = 8;
type ResultFilter = "all" | "reviewed" | "pending";

const SKILL_LABEL: Record<string, string> = {
  speaking: "Speaking",
  writing: "Writing",
  reading: "Reading",
  listening: "Listening",
};

/** The "results per assignment" dialog — every assigned student, with a button to open the ones
 *  that can be reviewed. Presentational: the caller passes in all the batch's assignments,
 *  submitted or not, and the set's results. Shared by the assignments page and the class detail. */
export function TestResultsDialog({
  open,
  title,
  subtitle,
  skill,
  total,
  submitted,
  assignments,
  results,
  isLoading,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  skill?: string;
  total: number;
  submitted: number;
  assignments: Assignment[];
  results: AssignmentResult[];
  isLoading: boolean;
  onClose: () => void;
}) {
  const resultByAssignment = useMemo(
    () => new Map(results.filter((result) => result.assignment_id).map((result) => [result.assignment_id!, result])),
    [results],
  );
  const rows = useMemo(
    () => assignments.map((assignment) => ({ assignment, result: resultByAssignment.get(assignment.id) })),
    [assignments, resultByAssignment],
  );
  const reviewed = rows.filter((row) => row.result?.review_status === "approved").length;
  const pending = rows.filter((row) => row.result && row.result.review_status !== "approved").length;

  const qc = useQueryClient();
  // Grade or view a result right inside the dialog instead of navigating to a route.
  const [openResultId, setOpenResultId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [page, setPage] = useState(1);

  // A Mock Test (several skills, purpose='mock') can land in this batch — the assignment
  // is created by `NewMockAssignment` with origin='assigned', exactly like teacher-assigned work,
  // so it still comes through `ListByPartner`. `results` already carries the payload (EffectiveResult), so it
  // can be detected straight from the list without another fetch.
  const openResult = openResultId ? results.find((r) => r.id === openResultId) ?? null : null;
  const openIsMock = !!openResult && isMockResult(openResult.result);
  const closeOpenResult = () => {
    setOpenResultId(null);
    // Refresh the results so the status updates after grading.
    qc.invalidateQueries({ queryKey: ["results"] });
  };

  // Reset the filter and page every time the dialog opens (the component stays mounted, only `open` toggles).
  useEffect(() => {
    if (open) {
      setFilter("all");
      setPage(1);
    }
  }, [open]);

  const filteredRows = useMemo(() => {
    if (filter === "reviewed") return rows.filter((row) => row.result?.review_status === "approved");
    if (filter === "pending") return rows.filter((row) => row.result && row.result.review_status !== "approved");
    return rows;
  }, [rows, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectFilter = (next: ResultFilter) => {
    setFilter(next);
    setPage(1);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Kết quả bài làm theo bài tập"
        size="xl"
        hideHeader
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5">
          <div className="shrink-0">
            <div className="flex flex-wrap items-center gap-3 pr-10">
              {skill && (
                <span className={cn("rounded-full border px-3 py-0.5 text-xs font-semibold", skill === "speaking" ? "border-success-200 bg-success-50 text-success-700" : "border-warning-200 bg-warning-50 text-warning-700")}>
                  {SKILL_LABEL[skill] ?? skill}
                </span>
              )}
              <span className="text-sm font-medium text-ink-500">Kết quả bài làm theo bài tập</span>
            </div>
            <h2 className="mt-2 text-xl font-bold leading-snug text-ink-900">{title}</h2>
            {subtitle && <p className="mt-1 text-[13px] text-ink-500">{subtitle}</p>}
          </div>

          <div className="grid shrink-0 gap-3 sm:grid-cols-3">
            <SummaryBox testId="result-summary-all" label="Đã nộp" value={`${submitted}/${total}`} color="text-brand-600" active={filter === "all"} onClick={() => selectFilter("all")} />
            <SummaryBox testId="result-summary-reviewed" label="Đã đánh giá" value={reviewed} color="text-success-700" active={filter === "reviewed"} onClick={() => selectFilter("reviewed")} />
            <SummaryBox testId="result-summary-pending" label="Chờ đánh giá" value={pending} color="text-warning-700" active={filter === "pending"} onClick={() => selectFilter("pending")} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-ink-100">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-ink-400">Đang tải kết quả...</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">Chưa có học viên nào được giao bài này.</p>
            ) : filteredRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">Không có bài khớp bộ lọc.</p>
            ) : (
              <div className="divide-y divide-ink-100">
                {pagedRows.map(({ assignment, result }) => {
                  const handedIn = SUBMITTED.has(assignment.status);
                  const approved = result?.review_status === "approved";
                  const score = result ? displayScore(result) : null;
                  return (
                    <div
                      key={assignment.id}
                      data-testid={handedIn ? `result-row-${assignment.id}` : `result-row-missing-${assignment.id}`}
                      className="grid items-center gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto_56px_110px]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <AvatarInitials name={assignment.student_name || "Học viên"} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-900">{assignment.student_name || "Học viên"}</p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
                            {handedIn && <Clock className="size-3.5" />}
                            <span>
                              {!handedIn
                                ? "Chưa nộp bài"
                                : result
                                  ? `Nộp lúc ${new Date(result.created_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}`
                                  : "Đang xử lý kết quả"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            !handedIn
                              ? "border-error-200 bg-error-50 text-error-700"
                              : approved
                                ? "border-success-200 bg-success-50 text-success-700"
                                : "border-warning-200 bg-warning-50 text-warning-700",
                          )}
                        >
                          {!handedIn ? "Chưa nộp bài" : approved ? "Đã đánh giá" : "Chờ đánh giá"}
                        </span>
                        {result && result.grading_mode === "manual" ? (
                          <ManualGradingTag />
                        ) : (
                          result && isGateWithheld(result) && <GateFailTag gate={result.gate} />
                        )}
                      </div>
                      <span className="text-center text-base font-bold text-ink-900">{score ?? "—"}</span>
                      {!handedIn ? (
                        <span />
                      ) : result ? (
                        <Button size="sm" variant={approved ? "outline" : "default"} onClick={() => setOpenResultId(result.id)}>
                          {approved ? "Xem lại" : "Đánh giá"}
                        </Button>
                      ) : (
                        <Button size="sm" disabled>Đang xử lý</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {filteredRows.length > PAGE_SIZE && (
            <div className="shrink-0 pt-1">
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>
          )}
        </DialogBody>
        <DialogFooter className="justify-between py-3">
          <p className="text-sm text-ink-500">{submitted} học viên đã nộp bài</p>
          <Button size="sm" variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </Dialog>

      {openResultId && openIsMock && (
        <MockResultReview resultId={openResultId} onClose={closeOpenResult} />
      )}
      {openResultId && !openIsMock && (
        <ResultReviewModal id={openResultId} onClose={closeOpenResult} />
      )}
    </>
  );
}

function SummaryBox({
  label,
  value,
  color,
  active,
  testId,
  onClick,
}: {
  label: string;
  value: string | number;
  color: string;
  active: boolean;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-4 py-3 text-left transition",
        active
          ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/30"
          : "border-ink-100 bg-white hover:border-ink-200 hover:bg-ink-50/60",
      )}
    >
      <p className="text-[13px] font-semibold text-ink-500">{label}</p>
      <p className={cn("mt-0.5 text-xl font-bold", color)}>{value}</p>
    </button>
  );
}

/** The score shown to a teacher (see `resultScoreLabel`): hidden (null) when the attempt did NOT pass
 *  the confidence gate and has not been reviewed — the AI score is not trustworthy enough to show yet. */
export function displayScore(result: AssignmentResult): string | null {
  if (isGateWithheld(result)) return null;
  return resultScoreLabel(result.result, result.band ?? extractBand(result.result));
}

/** The attempt failed the confidence gate and no teacher has graded it → the score is withheld. */
export function isGateWithheld(result: AssignmentResult): boolean {
  return result.gate?.status === "fail" && !result.reviewed_at;
}

/** Warning tag for an attempt below the confidence gate (the AI was not confident enough → grade it manually). */
export function GateFailTag({ gate }: { gate?: ResultGate }) {
  const score =
    typeof gate?.raw_score === "number"
      ? ` (độ tin cậy ${gate.raw_score.toFixed(1)}/10, ngưỡng ${gate.threshold.toFixed(1)})`
      : "";
  return (
    <span
      title={`AI chưa đủ tin cậy để chấm tự động${score} — điểm đã được ẩn, giáo viên cần tự chấm trước khi duyệt.`}
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
    >
      <AlertTriangle className="size-3.5 shrink-0" /> AI chưa đủ tự tin
    </span>
  );
}

/** Pull the overall band out of the result shape (it differs between speaking and writing). */
export function extractBand(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const candidates = [
    record.overall_band,
    record.band,
    record.final_band,
    (record.overall_feedback as Record<string, unknown> | undefined)?.final_band,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number") return candidate;
    if (typeof candidate === "string") {
      const n = Number(candidate);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}
