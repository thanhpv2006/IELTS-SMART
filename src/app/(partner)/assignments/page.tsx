"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, GraduationCap, LayoutGrid, List, Plus } from "lucide-react";

import { assignmentApi, classApi, resultApi } from "@/features/partner/api";
import { SORT_OPTIONS, type SortKey, sortComparator } from "@/features/assignments/assignment-sort";
import { AssignmentToolbar } from "@/features/assignments/assignment-toolbar";
import { BulkActionBar } from "@/features/assignments/bulk-action-bar";
import { RescheduleDialog } from "@/features/assignments/reschedule-dialog";
import { WithdrawConfirm } from "@/features/assignments/withdraw-confirm";
import { useBulkAssignmentMutation } from "@/features/assignments/use-bulk-mutation";
import { useViewMode } from "@/features/assignments/use-view-mode";
import {
  STATUS_FILTERS,
  TOTAL_LABEL,
  assignmentGroupKey,
  toBatches,
  toClassGroups,
  type Batch,
  type ClassGroup,
  type StatusFilterKey,
} from "@/features/partner/assignment-groups";
import { AssignmentClassGrid } from "@/features/partner/assignment-class-grid";
import { AssignmentClassTable } from "@/features/partner/assignment-class-table";
import { ClassAssignmentTable, batchTitle } from "@/features/partner/class-assignment-table";
import { QuickAssignDialog } from "@/features/partner/quick-assign-dialog";
import { AssignDialog } from "@/features/partner/assign-dialog";
import { TestResultsDialog } from "@/features/partner/test-results-dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverDropdown } from "@/components/ui/hover-dropdown";
import { Pagination } from "@/components/ui/search-pagination";

const GROUP_PAGE_SIZE = 12;
const BATCH_PAGE_SIZE = 10;
const VIEW_STORAGE_KEY = "ielts_smart_assignments_view";

type BulkDialog = "reschedule" | "reassign" | "withdraw" | null;

const TRIGGER_CLS =
  "h-[34px] min-w-[150px] justify-between border-hw-line-3 bg-white text-xs font-medium text-hw-ink-2 hover:bg-hw-surface";

const shortDate = (v?: string) => (v ? new Date(v).toLocaleDateString("vi-VN") : "");

function MenuItem({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] hover:bg-hw-blue-sel",
        selected ? "bg-hw-blue-sel font-bold text-hw-blue" : "text-hw-ink-2",
      )}
    >
      {label}
    </button>
  );
}

export default function AssignmentsPage() {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => assignmentApi.list(),
  });
  const { data: classes = [] } = useQuery({ queryKey: ["classes"], queryFn: classApi.list });

  const knownClassIds = useMemo(() => new Set(classes.map((c) => c.id)), [classes]);
  const batches = useMemo(() => toBatches(assignments, knownClassIds), [assignments, knownClassIds]);

  const [status, setStatus] = useState<StatusFilterKey>("all");
  const [classFilter, setClassFilter] = useState<string | null>(null);
  // Per the design doc the folders open as a list; the stored choice still wins once made.
  const [view, setView] = useViewMode(VIEW_STORAGE_KEY, "list");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [batchPageSize, setBatchPageSize] = useState(BATCH_PAGE_SIZE);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<BulkDialog>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [quickAssign, setQuickAssign] = useState<ClassGroup | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);

  const statusFilter = STATUS_FILTERS.find((f) => f.key === status)!;
  const matching = useMemo(() => batches.filter(statusFilter.match), [batches, statusFilter]);

  // The cards follow the class filter but not the status filter: scoping them by status would zero
  // out every card except the chosen one. Counting them over every class instead would print
  // centre-wide totals above a single class's folder row — two numbers on screen disagreeing.
  const cardScope = useMemo(
    () => (classFilter ? batches.filter((b) => b.groupKey === classFilter) : batches),
    [batches, classFilter],
  );

  // The dropdown lists every folder regardless of the status filter, so narrowing by status can
  // never strand the class filter on an option that has just disappeared.
  const allGroups = useMemo(() => toClassGroups(batches, classes), [batches, classes]);
  const groups = useMemo(() => toClassGroups(matching, classes), [matching, classes]);

  const visibleGroups = useMemo(() => {
    let list = groups;
    if (classFilter) list = list.filter((g) => g.key === classFilter);
    if (status !== "all") list = list.filter((g) => g.total > 0);
    return list;
  }, [groups, classFilter, status]);

  const openGroup = openKey ? visibleGroups.find((g) => g.key === openKey) ?? null : null;

  // Search and sort belong to a class's assignment runs, not to the folder list: the bulk actions
  // act on runs, so the controls sit where their targets are.
  const openBatches = useMemo(() => {
    if (!openGroup) return [];
    const q = query.trim().toLowerCase();
    const matched = q
      ? openGroup.batches.filter((b) => (b.setName ?? "").toLowerCase().includes(q))
      : [...openGroup.batches];
    return matched.sort(sortComparator(sort));
  }, [openGroup, query, sort]);

  const shownBatchCount = openGroup
    ? openBatches.length
    : visibleGroups.reduce((n, g) => n + g.total, 0);

  const pageSize = openGroup ? batchPageSize : GROUP_PAGE_SIZE;
  const pageItems: (ClassGroup | Batch)[] = openGroup ? openBatches : visibleGroups;
  const totalPages = Math.max(1, Math.ceil(pageItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = pageItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };
  const hasFilter = status !== "all" || classFilter !== null;

  const clearSelection = () => setSelectedKeys(new Set());
  const toggleOne = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAllOnPage = (checked: boolean) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of paged as Batch[]) {
        if (checked) next.add(item.key);
        else next.delete(item.key);
      }
      return next;
    });

  const selectedBatches = useMemo(
    () => openBatches.filter((b) => selectedKeys.has(b.key)),
    [openBatches, selectedKeys],
  );
  const selectedPendingCount = selectedBatches.reduce((n, b) => n + b.pendingIds.length, 0);
  const selectedSubmittedCount = selectedBatches.reduce((n, b) => n + b.submitted, 0);
  const bulk = useBulkAssignmentMutation(() => {
    clearSelection();
    setBulkDialog(null);
  });

  const { data: batchResults = [], isLoading: loadingBatchResults } = useQuery({
    queryKey: ["results", selectedBatch?.testId],
    queryFn: () => resultApi.list({ testId: selectedBatch!.testId }),
    enabled: selectedBatch !== null,
  });

  // Every assigned student, not only those who submitted — the dialog is what answers
  // "ai chưa nộp", so a student with no submission still needs a row.
  const selectedAssignments = useMemo(() => {
    if (!selectedBatch) return [];
    return assignments.filter(
      (a) =>
        a.test_id === selectedBatch.testId &&
        a.created_at === selectedBatch.createdAt &&
        assignmentGroupKey(a, knownClassIds) === selectedBatch.groupKey,
    );
  }, [assignments, selectedBatch, knownClassIds]);

  // Selection and search belong to the class being viewed. Carrying them across the drill-down
  // would leave a bulk action pointing at rows the reviewer can no longer see.
  const openFolder = (group: ClassGroup) => {
    setOpenKey(group.key);
    setPage(1);
    setQuery("");
    clearSelection();
  };
  const backToFolders = () => {
    setOpenKey(null);
    setPage(1);
    setQuery("");
    clearSelection();
  };

  return (
    <div className="flex flex-col gap-4">
      {!openGroup && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-hw-ink">Bài tập</h1>
              <p className="mt-1 text-[12.5px] text-hw-ink-4">
                Quản lý bài tập đã giao cho các lớp — theo dõi nộp bài và chấm điểm.
              </p>
            </div>
            <Button
              data-testid="assign-dialog-btn"
              className="bg-hw-blue hover:bg-hw-blue-hover"
              onClick={() => setAssignOpen(true)}
            >
              <Plus /> Giao bài tập
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            {STATUS_FILTERS.map((f) => {
              const active = status === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  data-testid={`filter-stat-${f.key}`}
                  onClick={() => reset(setStatus)(f.key)}
                  className={cn(
                    "rounded-xl border bg-white px-4 py-3 text-left transition-colors",
                    active ? "border-[1.5px] border-hw-blue" : "border-hw-line hover:border-hw-blue-border",
                  )}
                >
                  <div className="text-xs text-hw-ink-3">{f.key === "all" ? TOTAL_LABEL : f.label}</div>
                  <div className={cn("num mt-1 text-xl font-extrabold", f.tone)}>
                    {cardScope.filter(f.match).length}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div data-testid="assignment-class-filter">
              <HoverDropdown
                label={classFilter ? allGroups.find((g) => g.key === classFilter)?.name ?? "Tất cả lớp" : "Tất cả lớp"}
                triggerClassName={TRIGGER_CLS}
              >
                {(close) => (
                  <div className="max-h-65 overflow-y-auto">
                    <MenuItem
                      label="Tất cả lớp"
                      selected={classFilter === null}
                      onClick={() => {
                        reset(setClassFilter)(null);
                        close();
                      }}
                    />
                    {allGroups.map((g) => (
                      <MenuItem
                        key={g.key}
                        label={g.name}
                        selected={classFilter === g.key}
                        onClick={() => {
                          reset(setClassFilter)(g.key);
                          close();
                        }}
                      />
                    ))}
                  </div>
                )}
              </HoverDropdown>
            </div>
            <div data-testid="assignment-status-filter">
              <HoverDropdown label={statusFilter.label} triggerClassName={TRIGGER_CLS}>
                {(close) => (
                  <div>
                    {STATUS_FILTERS.map((f) => (
                      <MenuItem
                        key={f.key}
                        label={f.label}
                        selected={status === f.key}
                        onClick={() => {
                          reset(setStatus)(f.key);
                          close();
                        }}
                      />
                    ))}
                  </div>
                )}
              </HoverDropdown>
            </div>
            {hasFilter && (
              <button
                type="button"
                onClick={() => {
                  setStatus("all");
                  setClassFilter(null);
                  setPage(1);
                }}
                className="text-[13px] font-medium text-hw-blue hover:text-hw-blue-hover"
              >
                Xóa lọc
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[13px] text-hw-ink-3">
                Hiển thị <strong className="num text-hw-ink">{shownBatchCount}</strong> bài
              </span>
              <div className="flex items-center gap-0.5 rounded-lg bg-hw-line p-0.5">
                <button
                  type="button"
                  data-testid="view-list"
                  onClick={() => setView("list")}
                  title="Dạng danh sách"
                  aria-label="Dạng danh sách"
                  className={cn(
                    "rounded-md px-2 py-1",
                    view === "list" ? "bg-white text-hw-blue shadow-sm" : "text-hw-ink-5",
                  )}
                >
                  <List className="size-3.5" />
                </button>
                <button
                  type="button"
                  data-testid="view-grid"
                  onClick={() => setView("grid")}
                  title="Dạng ô"
                  aria-label="Dạng ô"
                  className={cn(
                    "rounded-md px-2 py-1",
                    view === "grid" ? "bg-white text-hw-blue shadow-sm" : "text-hw-ink-5",
                  )}
                >
                  <LayoutGrid className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {openGroup && (
        <div>
          <button
            type="button"
            data-testid="assignments-back"
            onClick={backToFolders}
            className="mb-3 flex items-center gap-[7px] text-[13px] font-semibold text-hw-ink-3 hover:text-hw-ink"
          >
            <ArrowLeft className="size-4" /> Quay lại
          </button>
          <div className="flex items-center gap-2.5" data-testid="assignments-group-title">
            <span className="flex size-7 items-center justify-center rounded-lg bg-hw-blue-bg text-hw-blue">
              <GraduationCap className="size-4" />
            </span>
            <span className="text-[15px] font-bold text-hw-ink">{openGroup.name}</span>
            <span className="num text-xs text-hw-ink-4">{openGroup.total} bài</span>
          </div>
        </div>
      )}

      {openGroup && (
        <AssignmentToolbar
          query={query}
          onQueryChange={reset(setQuery)}
          searchPlaceholder="Tìm theo tên đề…"
          sort={sort}
          sortOptions={SORT_OPTIONS}
          onSortChange={reset(setSort)}
          view={view}
          onViewChange={setView}
          resultCount={openBatches.length}
          showReset={!!query.trim()}
          onReset={() => {
            setQuery("");
            setPage(1);
          }}
        />
      )}

      {bulk.message && (
        <p
          data-testid="bulk-message"
          className={cn(
            "rounded-lg px-3 py-2 text-[13px]",
            bulk.message.tone === "success"
              ? "bg-hw-green-bg text-hw-green"
              : "bg-hw-amber-bg text-hw-amber",
          )}
        >
          {bulk.message.text}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-hw-ink-5">Đang tải…</p>
      ) : batches.length === 0 ? (
        <Card data-testid="assignments-empty" className="p-10 text-center text-sm text-hw-ink-5">
          Chưa có bài giao nào.
        </Card>
      ) : pageItems.length === 0 ? (
        <Card className="p-10 text-center text-sm text-hw-ink-5">Không có bài khớp bộ lọc.</Card>
      ) : openGroup ? (
        <ClassAssignmentTable
          batches={paged as Batch[]}
          selectedKeys={selectedKeys}
          onToggle={toggleOne}
          onToggleAll={toggleAllOnPage}
          onOpen={setSelectedBatch}
        />
      ) : view === "list" ? (
        <AssignmentClassTable
          groups={paged as ClassGroup[]}
          onOpen={openFolder}
          onQuickAssign={setQuickAssign}
        />
      ) : (
        <AssignmentClassGrid
          groups={paged as ClassGroup[]}
          onOpen={openFolder}
          onQuickAssign={setQuickAssign}
        />
      )}

      {pageItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {openGroup ? (
            <label className="flex items-center gap-2 text-[13px] text-hw-ink-3">
              Số dòng mỗi trang
              <select
                data-testid="page-size"
                value={batchPageSize}
                onChange={(e) => reset(setBatchPageSize)(Number(e.target.value))}
                className="rounded-lg border border-hw-line-3 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-hw-blue"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span />
          )}
          {totalPages > 1 && (
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          )}
        </div>
      )}

      <BulkActionBar
        count={selectedBatches.length}
        pending={bulk.pending}
        onExtend={() => setBulkDialog("reschedule")}
        onCloseNow={() => bulk.closeNow(selectedBatches)}
        onWithdraw={() => setBulkDialog("withdraw")}
        onReassign={() => setBulkDialog("reassign")}
        onClear={clearSelection}
      />

      {bulkDialog === "reschedule" && (
        <RescheduleDialog
          count={selectedBatches.length}
          pending={bulk.pending}
          onSubmit={(deadline) => bulk.reschedule(selectedBatches, deadline)}
          onClose={() => setBulkDialog(null)}
        />
      )}
      {bulkDialog === "reassign" && (
        <RescheduleDialog
          count={selectedPendingCount}
          pending={bulk.pending}
          onSubmit={(deadline) => bulk.reassign(selectedBatches, deadline ?? undefined)}
          onClose={() => setBulkDialog(null)}
        />
      )}
      {bulkDialog === "withdraw" && (
        <WithdrawConfirm
          pendingCount={selectedPendingCount}
          submittedCount={selectedSubmittedCount}
          busy={bulk.pending}
          onConfirm={() => bulk.withdraw(selectedBatches)}
          onClose={() => setBulkDialog(null)}
        />
      )}

      {assignOpen && <AssignDialog onClose={() => setAssignOpen(false)} />}
      {quickAssign?.classId && (
        <QuickAssignDialog
          classId={quickAssign.classId}
          className={quickAssign.name}
          onClose={() => setQuickAssign(null)}
        />
      )}
      <TestResultsDialog
        open={selectedBatch !== null}
        title={selectedBatch ? batchTitle(selectedBatch) : ""}
        subtitle={
          selectedBatch
            ? `${selectedBatch.className}${selectedBatch.deadline ? ` · Hạn nộp ${shortDate(selectedBatch.deadline)}` : ""}`
            : undefined
        }
        skill={selectedBatch?.skill}
        total={selectedBatch?.total ?? 0}
        submitted={selectedBatch?.submitted ?? 0}
        assignments={selectedAssignments}
        results={batchResults}
        isLoading={loadingBatchResults}
        onClose={() => setSelectedBatch(null)}
      />
    </div>
  );
}
