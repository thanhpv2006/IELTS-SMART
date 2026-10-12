"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { HoverDropdown } from "@/components/ui/hover-dropdown";
import { SearchBar } from "@/components/ui/search-pagination";
import { cn } from "@/lib/utils";

import type { ClassStatus, SmartClass, Teacher } from "@/features/partner/api";
import { CLASS_STATUS_OPTIONS, statusLabel } from "@/features/partner/class-format";

const UNASSIGNED_TEACHER_ID = "__none__";

export type ClassFilters = {
  name: string | null;
  teacherId: string | null;
  status: ClassStatus | null;
  minStudents: number | null;
  maxStudents: number | null;
};

export const EMPTY_CLASS_FILTERS: ClassFilters = {
  name: null,
  teacherId: null,
  status: null,
  minStudents: null,
  maxStudents: null,
};

export function hasActiveFilters(f: ClassFilters): boolean {
  return (
    f.name != null ||
    f.teacherId != null ||
    f.status != null ||
    f.minStudents != null ||
    f.maxStudents != null
  );
}

export function applyClassFilters(items: SmartClass[], query: string, f: ClassFilters): SmartClass[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (q && !item.name.toLowerCase().includes(q)) return false;
    if (f.name != null && item.name !== f.name) return false;
    if (f.teacherId != null) {
      const matchesTeacher =
        f.teacherId === UNASSIGNED_TEACHER_ID ? !item.teacher_id : item.teacher_id === f.teacherId;
      if (!matchesTeacher) return false;
    }
    if (f.status != null && item.status !== f.status) return false;
    if (f.minStudents != null && item.student_count < f.minStudents) return false;
    if (f.maxStudents != null && item.student_count > f.maxStudents) return false;
    return true;
  });
}

function DropdownItem({
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
        "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-ink-50",
        selected && "bg-brand-50 text-brand-600 font-medium",
      )}
    >
      {label}
    </button>
  );
}

function FilterLabel({ children }: { children: ReactNode }) {
  return <span className="text-sm text-ink-500">{children}</span>;
}

function NameFilter({
  classes,
  filters,
  onFiltersChange,
}: {
  classes: SmartClass[];
  filters: ClassFilters;
  onFiltersChange: (f: ClassFilters) => void;
}) {
  const names = Array.from(new Set(classes.map((c) => c.name))).sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex items-center gap-1.5">
      <FilterLabel>Tên lớp:</FilterLabel>
      <HoverDropdown label={filters.name ?? "Tất cả"} active={filters.name != null}>
        {(close) => (
          <>
            <DropdownItem
              label="Tất cả"
              selected={filters.name == null}
              onClick={() => {
                onFiltersChange({ ...filters, name: null });
                close();
              }}
            />
            {names.map((name) => (
              <DropdownItem
                key={name}
                label={name}
                selected={filters.name === name}
                onClick={() => {
                  onFiltersChange({ ...filters, name });
                  close();
                }}
              />
            ))}
          </>
        )}
      </HoverDropdown>
    </div>
  );
}

function TeacherFilter({
  teachers,
  filters,
  onFiltersChange,
}: {
  teachers: Teacher[];
  filters: ClassFilters;
  onFiltersChange: (f: ClassFilters) => void;
}) {
  const triggerLabel =
    filters.teacherId == null
      ? "Tất cả"
      : filters.teacherId === UNASSIGNED_TEACHER_ID
        ? "Chưa gán giáo viên"
        : (teachers.find((t) => t.user_id === filters.teacherId)?.display_name ?? "Tất cả");

  return (
    <div className="flex items-center gap-1.5">
      <FilterLabel>Giáo viên:</FilterLabel>
      <HoverDropdown label={triggerLabel} active={filters.teacherId != null}>
        {(close) => (
          <>
            <DropdownItem
              label="Tất cả"
              selected={filters.teacherId == null}
              onClick={() => {
                onFiltersChange({ ...filters, teacherId: null });
                close();
              }}
            />
            {teachers.map((teacher) => (
              <DropdownItem
                key={teacher.user_id}
                label={teacher.display_name}
                selected={filters.teacherId === teacher.user_id}
                onClick={() => {
                  onFiltersChange({ ...filters, teacherId: teacher.user_id });
                  close();
                }}
              />
            ))}
            <DropdownItem
              label="Chưa gán giáo viên"
              selected={filters.teacherId === UNASSIGNED_TEACHER_ID}
              onClick={() => {
                onFiltersChange({ ...filters, teacherId: UNASSIGNED_TEACHER_ID });
                close();
              }}
            />
          </>
        )}
      </HoverDropdown>
    </div>
  );
}

function StatusFilter({
  filters,
  onFiltersChange,
}: {
  filters: ClassFilters;
  onFiltersChange: (f: ClassFilters) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <FilterLabel>Trạng thái:</FilterLabel>
      <HoverDropdown label={filters.status != null ? statusLabel(filters.status) : "Tất cả"} active={filters.status != null}>
        {(close) => (
          <>
            <DropdownItem
              label="Tất cả"
              selected={filters.status == null}
              onClick={() => {
                onFiltersChange({ ...filters, status: null });
                close();
              }}
            />
            {CLASS_STATUS_OPTIONS.map((opt) => (
              <DropdownItem
                key={opt.value}
                label={opt.label}
                selected={filters.status === opt.value}
                onClick={() => {
                  onFiltersChange({ ...filters, status: opt.value });
                  close();
                }}
              />
            ))}
          </>
        )}
      </HoverDropdown>
    </div>
  );
}

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

function NumberStepper({
  value,
  floor,
  ceiling,
  onChange,
}: {
  value: number | null;
  floor?: number;
  ceiling?: number;
  onChange: (next: number | null) => void;
}) {
  const step = (delta: number) => {
    let next = clampNonNegative((value ?? 0) + delta);
    if (floor != null) next = Math.max(next, floor);
    if (ceiling != null) next = Math.min(next, ceiling);
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-5)}
        className="h-6 w-6 shrink-0 rounded border border-ink-200 text-xs text-ink-500 hover:bg-ink-50"
      >
        −5
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          const n = Number(raw);
          onChange(raw === "" || Number.isNaN(n) ? null : clampNonNegative(n));
        }}
        className="w-16 min-w-0 flex-1 rounded border border-ink-200 px-1.5 py-1 text-center text-sm outline-none [appearance:textfield] focus:border-brand-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => step(5)}
        className="h-6 w-6 shrink-0 rounded border border-ink-200 text-xs text-ink-500 hover:bg-ink-50"
      >
        +5
      </button>
    </div>
  );
}

function StudentCountFilter({
  filters,
  onFiltersChange,
}: {
  filters: ClassFilters;
  onFiltersChange: (f: ClassFilters) => void;
}) {
  const triggerLabel =
    filters.minStudents == null && filters.maxStudents == null
      ? "Tất cả"
      : `${filters.minStudents ?? 0} – ${filters.maxStudents ?? "∞"}`;
  const active = filters.minStudents != null || filters.maxStudents != null;

  return (
    <div className="flex items-center gap-1.5">
      <FilterLabel>Số học viên:</FilterLabel>
      <HoverDropdown label={triggerLabel} active={active} align="right">
        {() => (
          <div className="w-80 space-y-2 p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <span className="text-xs text-ink-500">Tối thiểu</span>
                <NumberStepper
                  value={filters.minStudents}
                  ceiling={filters.maxStudents ?? undefined}
                  onChange={(minStudents) => onFiltersChange({ ...filters, minStudents })}
                />
              </div>
              <span className="pb-1.5 text-sm text-ink-400">–</span>
              <div className="flex-1 space-y-1">
                <span className="text-xs text-ink-500">Tối đa</span>
                <NumberStepper
                  value={filters.maxStudents}
                  floor={filters.minStudents ?? undefined}
                  onChange={(maxStudents) => onFiltersChange({ ...filters, maxStudents })}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, minStudents: null, maxStudents: null })}
              className="w-full rounded-lg bg-ink-50 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-100"
            >
              Xóa lọc
            </button>
          </div>
        )}
      </HoverDropdown>
    </div>
  );
}

export function ClassFilterBar({
  classes,
  teachers,
  isOwner,
  query,
  onQueryChange,
  filters,
  onFiltersChange,
}: {
  classes: SmartClass[];
  teachers: Teacher[];
  isOwner: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  filters: ClassFilters;
  onFiltersChange: (f: ClassFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchBar
        value={query}
        onChange={onQueryChange}
        placeholder="Tìm kiếm lớp học..."
        className="min-w-48 max-w-sm flex-1"
      />
      <NameFilter classes={classes} filters={filters} onFiltersChange={onFiltersChange} />
      {isOwner && <TeacherFilter teachers={teachers} filters={filters} onFiltersChange={onFiltersChange} />}
      <StatusFilter filters={filters} onFiltersChange={onFiltersChange} />
      <StudentCountFilter filters={filters} onFiltersChange={onFiltersChange} />
      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onFiltersChange(EMPTY_CLASS_FILTERS)}
          aria-label="Đặt lại bộ lọc"
          className="h-9 w-9 rounded-lg border border-ink-200 bg-white text-ink-500 hover:bg-ink-50"
        >
          <RotateCcw className="mx-auto size-4" />
        </button>
      )}
    </div>
  );
}
