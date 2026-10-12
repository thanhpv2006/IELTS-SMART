"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { classApi, resultApi, type SmartClass } from "@/features/partner/api";
import { shortDate, classDateRange } from "@/features/partner/class-format";
import { TestResultsDialog } from "@/features/partner/test-results-dialog";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/search-pagination";
import { GRADED as REVIEWED, SUBMITTED } from "@/features/partner/assignment-groups";
import { cn } from "@/lib/utils";


type AssignmentGroup = {
  testId: string;
  setName?: string;
  skill?: string;
  tier?: string;
  created?: string;
  deadline?: string;
  submitted: number;
  reviewed: number;
  count: number;
};

/** The list of work assigned to one class, grouped by set (test). Shared by the
 *  "Bài đã giao" dialog on the class page and the assignment section of the class detail screen.
 *  pageSize: turns pagination on (unpaginated by default — everything is shown).
 *  maxHeight: a tailwind class capping the height and scrolling the list. */
export function AssignedHomeworksList({
  cls,
  pageSize,
  maxHeight,
}: {
  cls: SmartClass;
  pageSize?: number;
  maxHeight?: string;
}) {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["class-assignments", cls.id],
    queryFn: () => classApi.assignments(cls.id),
  });

  const [page, setPage] = useState(1);
  const [resultsGroup, setResultsGroup] = useState<AssignmentGroup | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, AssignmentGroup>();
    for (const a of assignments) {
      let g = m.get(a.test_id);
      if (!g) {
        g = { testId: a.test_id, setName: a.test_name, skill: a.skill, tier: a.tier, created: a.created_at, deadline: a.deadline, submitted: 0, reviewed: 0, count: 0 };
        m.set(a.test_id, g);
      }
      g.count++;
      if (SUBMITTED.has(a.status)) g.submitted++;
      if (REVIEWED.has(a.status)) g.reviewed++;
    }
    return [...m.values()].sort((x, y) => (y.created ?? "").localeCompare(x.created ?? ""));
  }, [assignments]);

  // Every assigned student of the set whose result is open, submitted or not, so the dialog can
  // show who has not handed in (the backend already filtered assignments by class).
  const resultsAssignments = useMemo(() => {
    if (!resultsGroup) return [];
    return assignments.filter((a) => a.test_id === resultsGroup.testId);
  }, [assignments, resultsGroup]);

  const { data: groupResults = [], isLoading: loadingResults } = useQuery({
    queryKey: ["results", resultsGroup?.testId],
    queryFn: () => resultApi.list({ testId: resultsGroup!.testId }),
    enabled: resultsGroup !== null,
  });

  const totalPages = pageSize ? Math.max(1, Math.ceil(groups.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const visibleGroups = pageSize ? groups.slice((safePage - 1) * pageSize, safePage * pageSize) : groups;

  if (isLoading) return <p className="py-8 text-center text-sm text-ink-400">Đang tải…</p>;
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
        Lớp này chưa có bài tập nào được giao.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex flex-col gap-3", maxHeight && `${maxHeight} overflow-y-auto overscroll-contain pr-1`)}>
        {visibleGroups.map((g) => (
          <div
            key={g.testId}
            data-testid={`class-homework-${g.testId}`}
            role="button"
            tabIndex={0}
            onClick={() => setResultsGroup(g)}
            onKeyDown={(e) => { if (e.key === "Enter") setResultsGroup(g); }}
            title="Xem kết quả"
            className="cursor-pointer rounded-xl border border-ink-200 p-4 transition hover:border-brand-300 hover:bg-ink-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge
                  tone={g.tier === "full_test" ? "warning" : g.skill ? (g.skill === "speaking" ? "info" : "purple") : "gray"}
                  className="uppercase"
                >
                  {g.tier === "full_test" ? "Full test" : g.skill || "—"}
                </Badge>
                <div className="mt-1.5 text-[14px] font-semibold leading-snug text-ink-900">
                  {g.setName || `Đề ${g.testId.slice(0, 8)}`}
                </div>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-ink-500">
                <Clock className="size-3.5" />
                {g.created ? `Giao ${shortDate(g.created)}` : ""}
                {g.deadline ? ` · Hạn ${shortDate(g.deadline)}` : ""}
              </span>
            </div>
            <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
              <ProgressRow label="Đã nộp" value={g.submitted} total={g.count} color="bg-brand-500" />
              <ProgressRow label="Đã review" value={g.reviewed} total={g.count} color="bg-emerald-500" />
            </div>
          </div>
        ))}
      </div>
      {pageSize && <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />}

      <TestResultsDialog
        open={resultsGroup !== null}
        title={resultsGroup ? (resultsGroup.setName || `Đề ${resultsGroup.testId.slice(0, 8)}`) : ""}
        subtitle={`${cls.name} · ${classDateRange(cls)}`}
        skill={resultsGroup?.skill}
        total={resultsGroup?.count ?? 0}
        submitted={resultsGroup?.submitted ?? 0}
        assignments={resultsAssignments}
        results={groupResults}
        isLoading={loadingResults}
        onClose={() => setResultsGroup(null)}
      />
    </div>
  );
}

export function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-600">{label}</span>
        <span className="font-semibold text-ink-900 num">{value}/{total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
