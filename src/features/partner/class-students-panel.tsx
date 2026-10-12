"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  classApi,
  dashboardApi,
  studentApi,
  type SmartClass,
} from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";

export function ClassStudentsPanel({ cls }: { cls: SmartClass }) {
  const qc = useQueryClient();
  const isOwner = useAuthStore((s) => s.role === "partner_owner");

  const { data: base = [] } = useQuery({
    queryKey: isOwner ? ["students"] : ["my-students"],
    queryFn: isOwner ? studentApi.list : dashboardApi.myStudents,
  });

  const { data: unassigned = [] } = useQuery({
    queryKey: ["my-students-unassigned"],
    queryFn: dashboardApi.unassignedStudents,
    enabled: !isOwner,
  });

  const students = useMemo<typeof base>(() => {
    if (isOwner) return base;
    const seen = new Set(base.map((s) => s.user_id));
    const extras = unassigned.filter((s) => !seen.has(s.user_id));
    return [...base, ...extras];
  }, [isOwner, base, unassigned]);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["classes", cls.id],
    queryFn: () => classApi.get(cls.id),
  });

  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addPopoverRef = useRef<HTMLDivElement>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["classes", cls.id] });
    qc.invalidateQueries({ queryKey: isOwner ? ["students"] : ["my-students"] });
    qc.invalidateQueries({ queryKey: ["my-students-unassigned"] });
  };

  const addStudents = useMutation({
    mutationFn: (ids: string[]) => classApi.addStudents(cls.id, ids),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e)),
  });
  const removeStudent = useMutation({
    mutationFn: (studentId: string) => classApi.removeStudents(cls.id, [studentId]),
    onSuccess: invalidate,
    onError: (e) => setError(errorMessage(e)),
  });

  const currentStudentIds = useMemo(
    () => new Set((detail?.students ?? []).map((student) => student.user_id)),
    [detail],
  );
  const availableStudents = useMemo(
    () => students.filter((s) => !currentStudentIds.has(s.user_id)),
    [students, currentStudentIds],
  );

  useEffect(() => {
    if (!addOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!addPopoverRef.current?.contains(e.target as Node)) setAddOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAddOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [addOpen]);

  const studentCount = detail?.students.length ?? cls.student_count;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink-900">Danh sách học viên</h3>
        <span className="text-sm font-medium text-brand-600">{studentCount} học viên</span>
      </div>

      <div ref={addPopoverRef} className="relative">
        <Button data-testid="open-add-students" type="button" className="h-9" onClick={() => setAddOpen((v) => !v)}>
          <Plus /> Thêm học viên
        </Button>
        {addOpen && (
          <div className="absolute z-30 mt-1 w-80 max-h-96 overflow-y-auto rounded-xl border border-ink-200 bg-white p-2 shadow-xl">
            <p className="px-2 py-1 text-xs font-semibold uppercase text-ink-400">
              Chưa có trong lớp
            </p>
            {availableStudents.length === 0 ? (
              <p className="px-2 py-3 text-sm text-ink-400">Không còn học viên nào để thêm.</p>
            ) : (
              availableStudents.map((s) => (
                <div
                  key={s.user_id}
                  data-testid={`available-student-${s.user_id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-ink-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{s.display_name}</span>
                  <span className="text-xs text-ink-500">Band {s.current_band ?? "—"}</span>
                  <Button
                    data-testid={`add-student-btn-${s.user_id}`}
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      addStudents.mutate([s.user_id]);
                    }}
                    disabled={addStudents.isPending}
                  >
                    + Thêm
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}

      <div className="max-h-[22rem] divide-y divide-ink-100 overflow-y-auto">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-ink-400">Đang tải...</p>
        ) : (detail?.students ?? []).length === 0 ? (
          <p data-testid="class-students-empty" className="px-2 py-3 text-sm text-ink-400">
            Chưa có học viên trong lớp.
          </p>
        ) : (
          detail?.students.map((student) => (
            <div key={student.user_id} className="flex items-center gap-2 px-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">
                {student.display_name}
              </span>
              <span className="text-xs text-ink-500">Band {student.current_band ?? "—"}</span>
              <button
                data-testid={`remove-student-btn-${student.user_id}`}
                type="button"
                aria-label="Xóa khỏi lớp"
                onClick={() => {
                  setError(null);
                  removeStudent.mutate(student.user_id);
                }}
                disabled={removeStudent.isPending}
                className="text-ink-400 hover:text-error-700"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
