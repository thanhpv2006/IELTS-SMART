"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, User, X } from "lucide-react";

import {
  studentAssignmentApi,
  studentResultApi,
  type StudentAssignment,
} from "@/features/student/api";
import { StudentResultView } from "@/app/(partner)/results/[id]/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/search-pagination";
import {
  isMockResult,
  type MockResultPayload,
} from "@/features/mock/mock-result-types";
import { MockResultView } from "@/features/mock/mock-result-view";
import { takeHref } from "@/features/student/take-href";
import {
  AssignmentStatChips,
  type StatFilter,
} from "@/features/assignments/assignment-stat-chips";
import { AssignmentToolbar } from "@/features/assignments/assignment-toolbar";
import {
  STUDENT_SORT_OPTIONS,
  type StudentSortKey,
  sortComparator,
} from "@/features/assignments/assignment-sort";
import { useViewMode } from "@/features/assignments/use-view-mode";
import {
  deadlineLabel,
  isDueSoon,
  isOverdue,
  shortDate,
} from "@/features/assignments/deadline";
import {
  skillLabelOf,
  skillToneOf,
  studentStatusLabelOf,
  tierLabel,
} from "@/features/assignments/assignment-format";
import { StudentAssignmentTable } from "@/features/assignments/student-assignment-table";
import { resultScoreLabel } from "@/features/results/score-label";
import { StudentUrgentStrip } from "@/features/assignments/student-urgent-strip";

const VIEW_STORAGE_KEY = "ielts_smart_student_assignments_view";
const PAGE_SIZE = 12;
const URGENT_DAYS = 2;

type SkillFilter =
  "all" | "reading" | "listening" | "writing" | "speaking" | "full_test";
type StatusFilter = "all" | "todo" | "submitted" | "done";

const SKILL_FILTERS: { key: SkillFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "reading", label: "Reading" },
  { key: "listening", label: "Listening" },
  { key: "writing", label: "Writing" },
  { key: "speaking", label: "Speaking" },
  { key: "full_test", label: "Full test" },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "todo", label: "Chưa làm" },
  { key: "submitted", label: "Đã nộp" },
  { key: "done", label: "Có kết quả" },
];

function matchStatus(f: StatusFilter, status: string): boolean {
  if (f === "all") return true;
  if (f === "todo") return status === "pending";
  if (f === "submitted")
    return (
      status === "submitted" || status === "scored" || status === "reviewed"
    );
  return status === "released";
}

const CHIPS: StatFilter<StudentAssignment>[] = [
  { key: "all", label: "Tất cả", color: "text-ink-900", match: () => true },
  {
    key: "todo",
    label: "Cần làm",
    color: "text-warning-700",
    match: (a) => a.status === "pending",
  },
  {
    key: "grading",
    label: "Đang chấm",
    color: "text-purple-700",
    match: (a) =>
      a.status === "submitted" ||
      a.status === "scored" ||
      a.status === "reviewed",
  },
  {
    key: "done",
    label: "Có kết quả",
    color: "text-success-700",
    match: (a) => a.status === "released",
  },
  {
    key: "overdue",
    label: "Quá hạn",
    color: "text-error-700",
    match: (a) => a.status === "pending" && isOverdue(a.deadline),
  },
];

const CHIP_MATCH: Record<string, (a: StudentAssignment) => boolean> =
  Object.fromEntries(CHIPS.map((c) => [c.key, c.match]));

const selectCls =
  "rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[13px] font-medium text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export default function StudentAssignmentsPage() {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["student-assignments", "assigned"],
    queryFn: () => studentAssignmentApi.list({ origin: "assigned" }),
  });

  const { data: results = [] } = useQuery({
    queryKey: ["student-results"],
    queryFn: studentResultApi.list,
    enabled: assignments.some((a) => a.status === "released"),
  });

  const resultByAssignment = Object.fromEntries(
    results.filter((r) => r.assignment_id).map((r) => [r.assignment_id!, r]),
  );

  // Results open as an in-place dialog, like the teacher flow.
  const [openResultId, setOpenResultId] = useState<string | null>(null);

  // StudentResultView only understands the flat single-skill shape; a Mock Test
  // has to be fetched first to detect `.skills` and render MockResultView (the
  // query key is shared internally, so the non-mock branch costs no extra call).
  const { data: openResult } = useQuery({
    queryKey: ["student-result", openResultId],
    queryFn: () => studentResultApi.get(openResultId!),
    enabled: !!openResultId,
  });
  const openMockPayload =
    openResult && isMockResult(openResult.result) ? openResult.result : null;

  const [chip, setChip] = useState("all");
  const [query, setQuery] = useState("");
  const [skillF, setSkillF] = useState<SkillFilter>("all");
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<StudentSortKey>("newest");
  const [page, setPage] = useState(1);
  const [view, setView] = useViewMode(VIEW_STORAGE_KEY);

  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  // Narrowed by skill/status/search but NOT by the chip, so the chips count
  // within the same scope the list is showing.
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((a) => {
      const skillMatch =
        skillF === "all" ||
        (skillF === "full_test"
          ? a.purpose === "mock"
          : a.purpose !== "mock" && a.skill === skillF);
      const nameMatch = !q || (a.test_name ?? "").toLowerCase().includes(q);
      return skillMatch && matchStatus(statusF, a.status) && nameMatch;
    });
  }, [assignments, skillF, statusF, query]);

  const filtered = useMemo(() => {
    const match = CHIP_MATCH[chip] ?? CHIP_MATCH.all;
    return scoped
      .filter(match)
      .map((a) => ({ ...a, createdAt: a.created_at }))
      .sort(sortComparator(sort));
  }, [scoped, chip, sort]);

  const urgent = useMemo(
    () =>
      assignments.filter(
        (a) =>
          a.status === "pending" &&
          (isOverdue(a.deadline) || isDueSoon(a.deadline, URGENT_DAYS)),
      ),
    [assignments],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const hasActiveFilter =
    chip !== "all" || skillF !== "all" || statusF !== "all" || !!query.trim();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Bài tập
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Bài tập được giao cho bạn. Mở bài để làm hoặc xem kết quả.
        </p>
      </div>

      {!isLoading && assignments.length > 0 && (
        <>
          <AssignmentStatChips
            items={scoped}
            filters={CHIPS}
            active={chip}
            onChange={resetPage(setChip)}
          />

          <AssignmentToolbar
            query={query}
            onQueryChange={resetPage(setQuery)}
            searchPlaceholder="Tìm theo tên đề…"
            sort={sort}
            sortOptions={STUDENT_SORT_OPTIONS}
            onSortChange={resetPage(setSort)}
            view={view}
            onViewChange={setView}
            resultCount={filtered.length}
            showReset={hasActiveFilter}
            onReset={() => {
              setChip("all");
              setQuery("");
              setSkillF("all");
              setStatusF("all");
              setPage(1);
            }}
            filters={
              <>
                <label className="flex items-center gap-1.5">
                  <span className="text-sm text-ink-500">Kỹ năng:</span>
                  <select
                    data-testid="filter-skill"
                    value={skillF}
                    onChange={(e) =>
                      resetPage(setSkillF)(e.target.value as SkillFilter)
                    }
                    className={selectCls}
                  >
                    {SKILL_FILTERS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-sm text-ink-500">Trạng thái:</span>
                  <select
                    data-testid="filter-status"
                    value={statusF}
                    onChange={(e) =>
                      resetPage(setStatusF)(e.target.value as StatusFilter)
                    }
                    className={selectCls}
                  >
                    {STATUS_FILTERS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            }
          />

          <StudentUrgentStrip items={urgent} />
        </>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-400">Đang tải…</p>
      ) : assignments.length === 0 ? (
        <Card
          data-testid="assignments-empty"
          className="flex flex-col items-center gap-3 p-10 text-center"
        >
          <p className="text-sm text-ink-400">Chưa có bài nào được giao.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/student/practice">Tự luyện tập</Link>
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card
          data-testid="assignments-filtered-empty"
          className="p-10 text-center text-sm text-ink-400"
        >
          Không có bài nào khớp bộ lọc.
        </Card>
      ) : view === "list" ? (
        <StudentAssignmentTable
          items={paged}
          resultByAssignment={resultByAssignment}
          onOpenResult={setOpenResultId}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paged.map((a) => {
            const overdue = isOverdue(a.deadline);
            const canTake = a.status === "pending" && !overdue;
            const hasResult = a.status === "released";
            const result = resultByAssignment[a.id];
            const score = hasResult && result ? resultScoreLabel(result.result, result.band) : null;
            const due = deadlineLabel(a.deadline);
            const skill = skillLabelOf(a);
            const studentStatus = studentStatusLabelOf(a);
            return (
              <Card
                key={a.id}
                data-testid={`assignment-card-${a.id}`}
                className="flex flex-col p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={studentStatus.tone} className="whitespace-normal leading-snug">
                    {studentStatus.label}
                  </Badge>
                  {score && <span className="num text-lg font-bold text-success-700">{score}</span>}
                </div>

                <h3 className="mt-2.5 min-h-10 text-[15.5px] font-bold leading-snug text-ink-900">
                  {a.test_name || `Bài tập #${a.id.slice(0, 8)}`}
                </h3>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
                  {a.teacher_name && (
                    <span className="inline-flex items-center gap-1.5">
                      <User className="size-3.5" /> {a.teacher_name}
                    </span>
                  )}
                  {a.time_limit_minutes != null && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5" /> {a.time_limit_minutes} phút
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" /> Giao{" "}
                    {shortDate(a.created_at)}
                  </span>
                </div>

                <div className="mt-2.5">
                  <Badge data-testid={`deadline-badge-${a.id}`} tone={due.tone}>
                    <CalendarDays className="size-3.5" /> {due.label}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.purpose !== "mock" && a.tier && (
                    <Badge tone="gray">{tierLabel(a.tier)}</Badge>
                  )}
                  {skill && <Badge tone={skillToneOf(a)}>{skill}</Badge>}
                </div>

                <div className="mt-auto pt-4">
                  {canTake && (
                    <Button
                      data-testid={`take-btn-${a.id}`}
                      asChild
                      className="w-full"
                    >
                      <Link href={takeHref(a)}>Làm bài</Link>
                    </Button>
                  )}
                  {a.status === "pending" && overdue && (
                    <p className="text-center text-[13px] font-medium text-error-700">
                      Quá hạn — không thể làm bài
                    </p>
                  )}
                  {hasResult && result && (
                    <Button
                      data-testid={`view-result-btn-${a.id}`}
                      variant="soft"
                      className="w-full"
                      onClick={() => setOpenResultId(result.id)}
                    >
                      Xem kết quả
                    </Button>
                  )}
                  {hasResult && !result && (
                    <p className="text-center text-xs text-ink-400">
                      Đang tải kết quả…
                    </p>
                  )}
                  {a.status !== "pending" && !hasResult && (
                    <p className="text-center text-[13px] text-ink-400">
                      {studentStatus.label}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={setPage}
        />
      )}

      {openResultId && openMockPayload && (
        <MockResultDialog
          result={openMockPayload}
          onClose={() => setOpenResultId(null)}
        />
      )}
      {openResultId && !openMockPayload && (
        <StudentResultView
          id={openResultId}
          onClose={() => setOpenResultId(null)}
        />
      )}
    </div>
  );
}

// Minimal shell for a Mock Test result — same design language as
// MockResultReview/ReviewShell (header + close, with its own scrolling body).
function MockResultDialog({
  result,
  onClose,
}: {
  result: MockResultPayload;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/55 p-0 sm:p-3">
      <div className="mx-auto flex min-h-full max-w-[1400px] flex-col rounded-none bg-white shadow-2xl sm:rounded-[22px]">
        <header className="flex h-[86px] shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-4 sm:px-6">
          <h1 className="truncate text-base font-bold text-ink-900">
            Kết quả Mock Test
          </h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Đóng"
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto bg-ink-50 p-5">
          <MockResultView result={result} audience="student" />
        </main>
      </div>
    </div>
  );
}
