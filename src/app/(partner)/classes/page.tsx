"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ClipboardList,
  Eye,
  FileCheck2,
  GraduationCap,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import {
  classApi,
  teacherApi,
  type ClassStatus,
  type SmartClass,
} from "@/features/partner/api";
import {
  CLASS_STATUS_OPTIONS,
  classDateRange,
  levelBadgeClass,
  progressClass,
  statusBadgeClass,
  statusLabel,
  studentLabel,
} from "@/features/partner/class-format";
import {
  ClassFilterBar,
  EMPTY_CLASS_FILTERS,
  applyClassFilters,
  type ClassFilters,
} from "@/features/partner/class-filter-bar";
import { ClassListTable } from "@/features/partner/class-list-table";
import {
  ClassDeleteConfirm,
  rememberSkipDeleteToday,
  shouldSkipDeleteConfirm,
} from "@/features/partner/class-delete-confirm";
import { Pagination } from "@/components/ui/search-pagination";
import { LEVEL_OPTIONS } from "@/features/partner/levels";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AssignDialog } from "@/features/partner/assign-dialog";
import { AssignedHomeworksList } from "@/features/partner/class-assignments";
import { ClassStudentsDialog } from "@/features/partner/class-students-dialog";
import { ClassStudentsPanel } from "@/features/partner/class-students-panel";
import { ImportDialog } from "@/features/partner/import-dialog";

type ViewMode = "grid" | "list";
const VIEW_MODE_STORAGE_KEY = "ielts_smart_classes_view";

function readStoredViewMode(): ViewMode {
  if (typeof window === "undefined") return "grid";
  return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list" ? "list" : "grid";
}

const inputCls =
  "h-11 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-input bg-white px-3 pr-9 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export default function ClassesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const isOwner = useAuthStore((s) => s.role === "partner_owner");

  const [addClass, setAddClass] = useState<SmartClass | null>(null);
  const [assignedClass, setAssignedClass] = useState<SmartClass | null>(null);
  const [giaoBaiClass, setGiaoBaiClass] = useState<SmartClass | null>(null);
  const { data: classes = [], isLoading } = useQuery({ queryKey: ["classes"], queryFn: classApi.list });
  const { data: teachers = [] } = useQuery({ queryKey: ["teachers"], queryFn: teacherApi.list, enabled: isOwner });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  useEffect(() => { setViewMode(readStoredViewMode()); }, []);
  const setView = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  };

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ClassFilters>(EMPTY_CLASS_FILTERS);
  const filtered = useMemo(() => applyClassFilters(classes, query, filters), [classes, query, filters]);
  const visibleSelectedIds = useMemo(
    () => [...selectedIds].filter((id) => filtered.some((c) => c.id === id)),
    [selectedIds, filtered],
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  useEffect(() => { setPage(1); }, [query, filters, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const runDelete = async (ids: string[]) => {
    if (deletePending) return;
    setDeletePending(true);
    const results = await Promise.allSettled(ids.map((id) => classApi.delete(id)));
    const succeededIds = ids.filter((_, i) => results[i].status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    if (succeededIds.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["students"] });
    }
    setDeletePending(false);

    if (rejected.length > 0) {
      const reasons = [...new Set(rejected.map((r) => errorMessage(r.reason)))];
      setDeleteError(`Không xóa được ${rejected.length} lớp: ${reasons.join("; ")}`);
      setPendingDelete((current) => (current === null ? null : ids.filter((id) => !succeededIds.includes(id))));
    } else {
      setPendingDelete(null);
      setDeleteError(null);
    }
  };

  const requestDelete = (ids: string[]) => {
    if (deletePending) return;
    setDeleteError(null);
    if (shouldSkipDeleteConfirm()) {
      void runDelete(ids);
    } else {
      setPendingDelete(ids);
    }
  };

  const [importOpen, setImportOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SmartClass | null>(null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("Band 6.5");
  const [capacity, setCapacity] = useState("24");
  const [teacherId, setTeacherId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<ClassStatus>("active");
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setLevel("Band 6.5");
    setCapacity("24");
    setTeacherId(teachers[0]?.user_id ?? "");
    setStartDate("");
    setEndDate("");
    setStatus("active");
    setFormError(null);
    setFormOpen(true);
  };
  const openEdit = (item: SmartClass) => {
    setEditing(item);
    setName(item.name);
    setLevel(item.level ?? "Band 6.5");
    setCapacity(item.capacity ? String(item.capacity) : "24");
    setTeacherId(item.teacher_id ?? "");
    setStartDate(item.start_date ?? "");
    setEndDate(item.end_date ?? "");
    setStatus(item.status);
    setFormError(null);
    setFormOpen(true);
  };
  const closeForm = () => setFormOpen(false);

  const saveClass = useMutation({
    mutationFn: () => {
      const body = {
        name,
        level: level || undefined,
        capacity: capacity ? Number(capacity) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        teacher_id: teacherId || undefined,
        status: editing ? status : undefined,
      };
      return editing ? classApi.update(editing.id, body) : classApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      closeForm();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Quản lý lớp học</h1>
          <p className="mt-1 text-sm text-ink-500">Tạo lớp, thêm học viên và theo dõi bài tập đã giao cho từng lớp.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button data-testid="import-class-btn" type="button" variant="outline" className="h-11 px-5" onClick={() => setImportOpen(true)}>
            <Upload /> Nhập từ file
          </Button>
          <Button data-testid="add-class-btn" onClick={openCreate} className="h-11 px-5">
            <Plus /> Tạo lớp học
          </Button>
          <ViewModeToggle viewMode={viewMode} onChange={setView} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {viewMode === "list" && visibleSelectedIds.length > 0 && (
          <Button
            data-testid="bulk-delete-btn"
            type="button"
            variant="outline"
            className="h-9 border-error-200 bg-error-50 text-error-700 hover:bg-error-100"
            disabled={deletePending}
            onClick={() => requestDelete(visibleSelectedIds)}
          >
            <Trash2 /> Xóa ({visibleSelectedIds.length})
          </Button>
        )}
        <ClassFilterBar
          classes={classes}
          teachers={teachers}
          isOwner={isOwner}
          query={query}
          onQueryChange={setQuery}
          filters={filters}
          onFiltersChange={setFilters}
        />
      </div>

      {deleteError && !pendingDelete && (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{deleteError}</p>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-400">Đang tải...</p>
      ) : classes.length === 0 ? (
        <Card data-testid="classes-empty" className="p-12 text-center text-sm text-ink-400">
          Chưa có lớp nào.{" "}
          <button onClick={openCreate} className="font-medium text-brand-600 hover:underline">
            Tạo lớp đầu tiên
          </button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-ink-400">Không có lớp nào khớp bộ lọc.</Card>
      ) : viewMode === "grid" ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <ClassCard
              key={c.id}
              item={c}
              testId={`class-card-${c.id}`}
              onAssign={() => setAssignedClass(c)}
              onAddStudents={() => setAddClass(c)}
              onEdit={() => openEdit(c)}
              onView={() => router.push(`/classes/${c.id}`)}
              onDelete={() => requestDelete([c.id])}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <ClassListTable
            items={paged}
            selectedIds={selectedIds}
            onToggle={(id) =>
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={(checked) =>
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (checked) paged.forEach((c) => next.add(c.id));
                else paged.forEach((c) => next.delete(c.id));
                return next;
              })
            }
            onEdit={openEdit}
            onDelete={(c) => requestDelete([c.id])}
            onView={(id) => router.push(`/classes/${id}`)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <span>Hiển thị:</span>
              <select
                aria-label="Số dòng mỗi trang"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm outline-none focus:border-brand-500"
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>
      )}

      <Dialog
        open={formOpen}
        onClose={closeForm}
        title={editing ? "Chỉnh sửa lớp học" : "Tạo lớp học mới"}
        size={editing ? "xl" : "lg"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            saveClass.mutate();
          }}
        >
          <DialogBody className={editing ? "grid gap-6 lg:grid-cols-2" : undefined}>
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">
                  Tên lớp <span className="text-brand-500">*</span>
                </label>
                <input
                  data-testid="class-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="VD: IELTS 6.5 — A4"
                  className={inputCls}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink-700">Trình độ mục tiêu</label>
                  <div className="relative">
                    <select data-testid="class-level-select" value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
                      {LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">⌄</span>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink-700">Sĩ số tối đa</label>
                  <input
                    data-testid="class-capacity-input"
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* A teacher only creates their own classes → the backend assigns it and the field is hidden. Only an owner picks a teacher. */}
              {isOwner && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink-700">Giáo viên phụ trách</label>
                  <div className="relative">
                    <select
                      data-testid="class-teacher-select"
                      value={teacherId}
                      onChange={(e) => setTeacherId(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Chưa gán giáo viên</option>
                      {teachers.map((t) => (
                        <option key={t.user_id} value={t.user_id}>
                          {t.display_name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">⌄</span>
                  </div>
                </div>
              )}

              {editing != null && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink-700">Trạng thái</label>
                  <div className="flex gap-2">
                    {CLASS_STATUS_OPTIONS.map((option) => {
                      const selected = status === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          data-testid={`class-status-chip-${option.value}`}
                          onClick={() => setStatus(option.value)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                            selected
                              ? `${statusBadgeClass(option.value)} ring-1 ring-current/30`
                              : "border-ink-200 bg-white text-ink-500 hover:bg-ink-50",
                          )}
                        >
                          {selected && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <DateField label="Ngày bắt đầu" value={startDate} onChange={setStartDate} />
                <DateField label="Ngày kết thúc (dự kiến)" value={endDate} onChange={setEndDate} />
              </div>
              <p className="text-xs text-ink-400">Để trống cả hai ô nếu chưa đặt lịch.</p>

              {formError && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{formError}</p>}
            </div>

            {editing != null && (
              <div className="lg:border-l lg:border-ink-100 lg:pl-6">
                <ClassStudentsPanel cls={editing} />
              </div>
            )}
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={closeForm}>
              Hủy
            </Button>
            <Button data-testid="save-class-btn" type="submit" disabled={saveClass.isPending}>
              {saveClass.isPending ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo lớp"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      {addClass && <ClassStudentsDialog cls={addClass} onClose={() => setAddClass(null)} />}

      {assignedClass && (
        <AssignedHomeworksDialog
          cls={assignedClass}
          onClose={() => setAssignedClass(null)}
          onGiaoBaiMoi={() => {
            const c = assignedClass;
            setAssignedClass(null);
            setGiaoBaiClass(c);
          }}
        />
      )}
      {giaoBaiClass && <AssignDialog lockedClass={giaoBaiClass} onClose={() => setGiaoBaiClass(null)} />}

      {importOpen && (
        <ImportDialog
          title="Nhập lớp học từ file Excel"
          columns={isOwner
            ? <>File cần cột: <strong>Tên lớp</strong>, <strong>Trình độ</strong>, <strong>Sĩ số</strong>, <strong>Ngày bắt đầu</strong>, <strong>Ngày kết thúc</strong>, <strong>Email GV</strong> (ngày dạng YYYY-MM-DD hoặc DD/MM/YYYY; Email GV map theo email giáo viên đã có; chỉ Tên lớp bắt buộc).</>
            : <>File cần cột: <strong>Tên lớp</strong>, <strong>Trình độ</strong>, <strong>Sĩ số</strong>, <strong>Ngày bắt đầu</strong>, <strong>Ngày kết thúc</strong> (ngày dạng YYYY-MM-DD hoặc DD/MM/YYYY; chỉ Tên lớp bắt buộc). Các lớp sẽ tự được gán cho bạn (bỏ qua cột Email GV nếu có).</>}
          importFn={classApi.importXlsx}
          invalidateKeys={[["classes"]]}
          templateHref="/templates/mau-lop-hoc.xlsx"
          onClose={() => setImportOpen(false)}
        />
      )}

      {pendingDelete && (
        <ClassDeleteConfirm
          count={pendingDelete.length}
          error={deleteError}
          pending={deletePending}
          onConfirm={(skipToday) => {
            if (skipToday) rememberSkipDeleteToday();
            void runDelete(pendingDelete);
          }}
          onCancel={() => {
            if (!deletePending) {
              setPendingDelete(null);
              setDeleteError(null);
            }
          }}
        />
      )}
    </div>
  );
}

// ── Modal: Bài đã giao — <lớp> ────────────────────────────────────────────────

function AssignedHomeworksDialog({
  cls,
  onClose,
  onGiaoBaiMoi,
}: {
  cls: SmartClass;
  onClose: () => void;
  onGiaoBaiMoi: () => void;
}) {
  return (
    <Dialog open onClose={onClose} title={`Bài đã giao — ${cls.name}`} size="lg"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
          <GraduationCap className="size-4 text-ink-400" />
          <span>{cls.teacher_name ?? "Chưa gán GV"}</span>
          <span className="text-ink-300">·</span>
          <span>{cls.student_count} học viên</span>
          <span className="text-ink-300">·</span>
          <span>{classDateRange(cls)}</span>
        </div>

        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <AssignedHomeworksList cls={cls} />
        </div>
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onClose}>Đóng</Button>
        <Button onClick={onGiaoBaiMoi}><Plus /> Giao bài mới</Button>
      </DialogFooter>
    </Dialog>
  );
}

function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const buttonCls = (mode: ViewMode) =>
    cn(
      "inline-flex size-8 items-center justify-center rounded-lg",
      viewMode === mode ? "bg-brand-50 text-brand-600" : "text-ink-400 hover:text-ink-600",
    );
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-sm">
      <button type="button" aria-label="Dạng ô" className={buttonCls("grid")} onClick={() => onChange("grid")}>
        <LayoutGrid className="size-4" />
      </button>
      <button type="button" aria-label="Dạng danh sách" className={buttonCls("list")} onClick={() => onChange("list")}>
        <List className="size-4" />
      </button>
    </div>
  );
}

function ClassCard({
  item,
  onAssign,
  onAddStudents,
  onEdit,
  onView,
  onDelete,
  testId,
}: {
  item: SmartClass;
  onAssign: () => void;
  onAddStudents: () => void;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
  testId?: string;
}) {
  const percent = Math.round((item.completion_rate || 0) * 100);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Card
      data-testid={testId}
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => { if (e.key === "Enter") onView(); }}
      className="group relative flex min-h-[236px] cursor-pointer flex-col p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
    >
      {/* Wraps: the badge cluster never shrinks, so on a narrow card it would otherwise
          starve the name down to zero width and the card would show no class name at all. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="relative min-w-0 grow basis-40">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onView(); }}
            className="block w-full truncate text-left text-lg font-bold leading-7 text-ink-900 hover:text-brand-600"
          >
            {item.name}
          </button>
          {/* Flowbite-style tooltip (pure Tailwind, no JS): fades in on card hover, above the name. */}
          <div
            role="tooltip"
            className="pointer-events-none invisible absolute bottom-full left-0 z-30 mb-2 w-max max-w-[16rem] rounded-lg bg-ink-900 px-3 py-2 text-sm font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity duration-300 group-hover:visible group-hover:opacity-100"
          >
            {item.name}
            <span aria-hidden className="absolute -bottom-1 left-4 size-2 rotate-45 rounded-[1px] bg-ink-900" />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${levelBadgeClass(item.level)}`}>
            Mục tiêu {item.level?.replace(/^Band\s*/i, "") || "chưa đặt"}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {statusLabel(item.status)}
          </span>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 hover:bg-ink-50 hover:text-ink-900"
              aria-label="Mở thao tác lớp học"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
                <button
                  data-testid={`edit-class-btn-${item.id}`}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  <Pencil className="size-4 text-ink-400" /> Sửa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onView();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  <Eye className="size-4 text-ink-400" /> Xem chi tiết
                </button>
                <button
                  data-testid={`delete-class-btn-${item.id}`}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-error-700 hover:bg-error-50"
                >
                  <Trash2 className="size-4" /> Xoá
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm text-ink-500">
        <InfoRow icon={<GraduationCap className="size-4" />} text={item.teacher_name ?? "Chưa gán giáo viên"} />
        <InfoRow icon={<CalendarDays className="size-4" />} text={classDateRange(item)} />
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
          <InfoRow icon={<Users className="size-4" />} text={studentLabel(item)} />
          <InfoRow icon={<ClipboardList className="size-4" />} text={`${item.assignment_count || 0} bài đã giao`} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
          <span className="text-ink-600">Tiến độ hoàn thành</span>
          <span className="text-ink-900">{percent}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div className={`h-full rounded-full ${progressClass(percent)}`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
        <Button data-testid={`assign-from-class-btn`} type="button" variant="outline" className="h-10" onClick={(e) => { e.stopPropagation(); onAssign(); }}>
          <FileCheck2 /> Giao bài
        </Button>
        <Button data-testid={`add-students-btn`} type="button" variant="soft" className="h-10 border-brand-300 bg-white" onClick={(e) => { e.stopPropagation(); onAddStudents(); }}>
          <UserPlus /> Thêm HV
        </Button>
      </div>
    </Card>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-ink-700">{label}</label>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pl-10`} />
      </div>
    </div>
  );
}

function InfoRow({ icon, text }: { icon: ReactNode; text: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-400">{icon}</span>
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}
