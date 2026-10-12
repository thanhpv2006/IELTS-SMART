"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search, Send } from "lucide-react";
import { classApi } from "@/features/partner/api";
import { useAssignableStudents } from "@/features/partner/use-assignable-students";
import { mockApi } from "@/features/mock/api";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";

const inputCls =
  "h-11 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** The "assign a Mock" dialog — the set is preselected (setId); target is a whole class or hand-picked students. */
export function MockAssignDialog({ setId, onClose }: { setId: string; onClose: () => void }) {
  const qc = useQueryClient();

  const [mode, setMode] = useState<"class" | "students">("class");
  const [classId, setClassId] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: classes = [] } = useQuery({ queryKey: ["classes"], queryFn: classApi.list });
  // A teacher usually has just one class — treat it as selected so no dropdown interaction is needed.
  const activeClassId = classId || (classes.length === 1 ? classes[0].id : "");
  const { data: classDetail } = useQuery({
    queryKey: ["classes", activeClassId],
    queryFn: () => classApi.get(activeClassId),
    enabled: !!activeClassId,
  });
  const classStudents = classDetail?.students ?? [];

  const { data: students = [] } = useAssignableStudents(mode === "students");

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return q
      ? students.filter(
          (s) => s.display_name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q),
        )
      : students;
  }, [students, studentQuery]);

  const studentIds = mode === "class" ? classStudents.map((s) => s.user_id) : picked;

  const togglePick = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const assign = useMutation({
    mutationFn: () =>
      mockApi.assignMock(setId, {
        student_ids: studentIds,
        // Assigning to a class → freeze class_id into the assignment for later grouping/filtering.
        class_id: mode === "class" && activeClassId ? activeClassId : undefined,
        // <input type="date"> trả "YYYY-MM-DD"; BE cần RFC3339 → cuối ngày (local).
        deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["assignment-counts"] });
      qc.invalidateQueries({ queryKey: ["class-assignments"] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog open onClose={onClose} title="Giao đề Mock" size="lg" bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DialogBody className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
        {/* 1 · Giao cho */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2.5 shrink-0 text-[13.5px] font-bold text-ink-900">1 · Giao cho</div>
          <div className="mb-3 inline-flex w-full shrink-0 gap-1 rounded-lg bg-ink-100 p-1">
            {(["class", "students"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors",
                  mode === m ? "bg-white text-brand-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                {m === "class" ? "Cả lớp" : "Chọn học viên"}
              </button>
            ))}
          </div>

          {mode === "class" ? (
            classes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-200 px-3 py-3 text-sm text-ink-500">
                Bạn chưa có lớp nào. Liên hệ quản trị trung tâm để được phân lớp trước khi giao bài.
              </p>
            ) : (
              <div className="shrink-0">
                <label className="mb-1.5 block text-[13px] font-medium text-ink-700">Chọn lớp</label>
                <select
                  data-testid="mock-assign-class-select"
                  value={activeClassId}
                  onChange={(e) => setClassId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Chọn lớp —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.student_count} học viên
                    </option>
                  ))}
                </select>
                {activeClassId !== "" && classStudents.length === 0 && (
                  <p className="mt-2 text-sm text-ink-400">
                    Lớp chưa có học viên. Thêm học viên ở mục “Quản lý học viên” trước khi giao bài.
                  </p>
                )}
              </div>
            )
          ) : (
            <>
              <div className="mb-3 flex shrink-0 items-center gap-2 rounded-lg border border-input px-3 py-2">
                <Search className="size-4 text-ink-400" />
                <input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Tìm học viên theo tên, email…"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              {filteredStudents.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-400">Không có học viên phù hợp.</p>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                  {filteredStudents.map((s) => (
                    <label key={s.user_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-50">
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded border-2",
                          picked.includes(s.user_id) ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300 text-transparent",
                        )}
                      >
                        <Check className="size-3.5 stroke-[3]" />
                      </span>
                      <input type="checkbox" checked={picked.includes(s.user_id)} onChange={() => togglePick(s.user_id)} className="sr-only" />
                      <AvatarInitials name={s.display_name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{s.display_name}</span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                        {s.classes.length > 0
                          ? s.classes.map((c) => <Badge key={c.id} tone="info">{c.name}</Badge>)
                          : <Badge tone="gray">Chưa xếp lớp</Badge>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 2 · deadline */}
        <div className="shrink-0">
          <div className="mb-2.5 text-[13.5px] font-bold text-ink-900">2 · Hạn nộp</div>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
        </div>

        {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onClose}>Hủy</Button>
        <Button
          onClick={() => { setError(null); assign.mutate(); }}
          disabled={studentIds.length === 0 || assign.isPending}
        >
          <Send /> {assign.isPending ? "Đang giao…" : `Giao cho ${studentIds.length} học viên`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
