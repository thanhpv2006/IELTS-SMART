"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Search, Send } from "lucide-react";
import { assignmentApi, classApi, type SmartClass } from "@/features/partner/api";
import { useAssignableStudents } from "@/features/partner/use-assignable-students";
import { catalogApi } from "@/features/catalog/api";
import { SET_KIND_LABELS, normalizeKind, partLabel } from "@/features/catalog/types";
import type { CatalogQuestionSet, CatalogSetKind, CatalogSkill } from "@/features/catalog/types";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";

const inputCls =
  "h-11 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** Unified assignable-set shape — all published partner catalog sets (S/W/R/L) share this list. */
type AssignableSet = {
  id: string;
  name: string;
  skill: CatalogSkill;
  kind: CatalogSetKind;
  part?: number;
  duration_minutes?: number;
};

const SKILL_TONE: Record<CatalogSkill, "info" | "purple" | "success" | "warning"> = {
  speaking: "info",
  writing: "purple",
  reading: "success",
  listening: "warning",
};

// Published partner catalog sets — the assign POST is skill-agnostic, so all 4 skills slot into
// the same picker.
function catalogToAssignable(s: CatalogQuestionSet): AssignableSet {
  return {
    id: s.id,
    name: s.title,
    skill: (s.skill ?? "reading") as CatalogSkill,
    kind: normalizeKind(s.kind),
    part: s.part,
    duration_minutes: s.duration_minutes,
  };
}

/** The 3-step "assign work" dialog — shared by the question bank (preselected set) and classes (lockedClass). */
export function AssignDialog({
  onClose,
  preselectedSetId,
  lockedClass,
}: {
  onClose: () => void;
  preselectedSetId?: string;
  lockedClass?: SmartClass;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  // Single source for assignable sets: published partner catalog sets. full_test is excluded —
  // it is assigned only through MockAssignDialog (mockApi.assignMock), a distinct pipeline; the
  // skill-agnostic assignmentApi.assign here is for single-skill sets.
  const { data: catalogSets = [] } = useQuery({
    queryKey: ["catalog-sets", "published"],
    queryFn: () => catalogApi.listSets({ status: "published" }),
  });
  const sets = useMemo<AssignableSet[]>(
    () => catalogSets.filter((s) => s.kind !== "full_test").map(catalogToAssignable),
    [catalogSets],
  );
  const { data: classes = [] } = useQuery({ queryKey: ["classes"], queryFn: classApi.list, enabled: !lockedClass });

  const [query, setQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [setId, setSetId] = useState(preselectedSetId ?? "");
  const [mode, setMode] = useState<"class" | "students">("class");
  const [classId, setClassId] = useState(lockedClass?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A teacher usually has just one class — auto-select it so no dropdown is needed
  // and the student list appears immediately.
  useEffect(() => {
    if (!lockedClass && !classId && classes.length === 1) setClassId(classes[0].id);
  }, [classes, lockedClass, classId]);

  const activeClassId = lockedClass?.id ?? classId;
  const { data: classDetail } = useQuery({
    queryKey: ["classes", activeClassId],
    queryFn: () => classApi.get(activeClassId),
    enabled: !!activeClassId,
  });
  const classStudents = classDetail?.students ?? [];

  const globalPicker = mode === "students" && !lockedClass;
  const { data: allStudents = [] } = useAssignableStudents(globalPicker);

  const filteredSets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sets.filter((s) => s.name.toLowerCase().includes(q)) : sets;
  }, [sets, query]);
  const selectedSet = sets.find((s) => s.id === setId);
  useEffect(
    () => setTimeLimit(selectedSet?.duration_minutes ? String(selectedSet.duration_minutes) : ""),
    [selectedSet?.id, selectedSet?.duration_minutes],
  );
  const timeLimitApplies = selectedSet?.skill !== "speaking";
  const timeLimitMinutes = timeLimitApplies && timeLimit.trim() ? Number(timeLimit) : undefined;
  const timeLimitInvalid =
    timeLimitMinutes !== undefined &&
    !(Number.isInteger(timeLimitMinutes) && timeLimitMinutes >= 1 && timeLimitMinutes <= 240);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return q
      ? allStudents.filter(
          (s) => s.display_name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q),
        )
      : allStudents;
  }, [allStudents, studentQuery]);

  const studentIds = mode === "class" ? classStudents.map((s) => s.user_id) : picked;

  const assign = useMutation({
    mutationFn: () =>
      assignmentApi.assign(setId, {
        student_ids: studentIds,
        // Assigning to a class → freeze class_id into the assignment for later grouping/filtering.
        // Individual assignment (mode === "students") → do not send class_id.
        class_id: mode === "class" && activeClassId ? activeClassId : undefined,
        // <input type="date"> trả "YYYY-MM-DD"; BE cần RFC3339 → cuối ngày (local).
        deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : undefined,
        time_limit_minutes: timeLimitMinutes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["assignment-counts"] });
      onClose();
      // Once assigned → go to the assignments page to see it right away (a no-op if already there).
      router.push("/assignments");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const togglePick = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog open onClose={onClose} title="Giao bài tập" size="lg" bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DialogBody className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
        {/* 1 · pick a set — the list flexes and scrolls, the rest stays fixed */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2.5 shrink-0 text-[13.5px] font-bold text-ink-900">1 · Chọn đề từ ngân hàng</div>
          <div className="mb-3 flex shrink-0 items-center gap-2 rounded-lg border border-input px-3 py-2">
            <Search className="size-4 text-ink-400" />
            <input data-testid="assign-set-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm đề theo tên, mã đề…"
              className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {filteredSets.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">Không có đề phù hợp.</p>
            ) : (
              filteredSets.map((s) => (
                <button key={s.id} type="button" onClick={() => setSetId(s.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    setId === s.id ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-ink-300",
                  )}>
                  <span className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    setId === s.id ? "border-brand-500" : "border-ink-300",
                  )}>
                    {setId === s.id && <span className="size-2 rounded-full bg-brand-500" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={SKILL_TONE[s.skill]} className="uppercase">{s.skill}</Badge>
                      <span className="text-xs text-ink-400">
                        {SET_KIND_LABELS[s.kind]}
                        {s.part != null && ` · ${partLabel(s.skill, s.part)}`} · {setCode(s)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[13.5px] font-semibold text-ink-900">{s.name}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 2 · Giao cho */}
        <div className="shrink-0">
          <div className="mb-2.5 text-[13.5px] font-bold text-ink-900">2 · Giao cho</div>
          <div className="mb-3 inline-flex w-full gap-1 rounded-lg bg-ink-100 p-1">
            {(["class", "students"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={cn(
                  "flex-1 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors",
                  mode === m ? "bg-white text-brand-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}>
                {m === "class" ? "Cả lớp" : "Chọn học viên"}
              </button>
            ))}
          </div>

          {/* Class selector — only needed for "Cả lớp" (or when locked to a class). Hidden for individual assignment. */}
          {!globalPicker && (
            lockedClass ? (
              <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2.5 text-sm text-ink-900">
                <span>{lockedClass.name} · {classStudents.length} học viên</span>
              </div>
            ) : classes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-200 px-3 py-3 text-sm text-ink-500">
                Bạn chưa có lớp nào. Liên hệ quản trị trung tâm để được phân lớp trước khi giao bài.
              </p>
            ) : (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-700">Chọn lớp</label>
                <select data-testid="assign-class-select" value={classId} onChange={(e) => { setClassId(e.target.value); setPicked([]); }} className={inputCls}>
                  <option value="">— Chọn lớp —</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.student_count} học viên</option>)}
                </select>
              </div>
            )
          )}

          {/* A class was picked but is empty — say so clearly instead of leaving a puzzling disabled button. */}
          {mode === "class" && activeClassId !== "" && classStudents.length === 0 && (
            <p className="mt-2 text-sm text-ink-400">Lớp chưa có học viên. Thêm học viên ở mục “Quản lý học viên” trước khi giao bài.</p>
          )}

          {/* Individual assignment within one class (opened from the class page) — pick from its roster. */}
          {mode === "students" && !globalPicker && (
            activeClassId === "" ? (
              <p className="mt-2 text-sm text-ink-400">Chọn lớp trước để chọn học viên.</p>
            ) : classStudents.length === 0 ? (
              <p className="mt-2 text-sm text-ink-400">Lớp chưa có học viên.</p>
            ) : (
              <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                {classStudents.map((s) => (
                  <label key={s.user_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-50">
                    <span className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded border-2",
                      picked.includes(s.user_id) ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300 text-transparent",
                    )}>
                      <Check className="size-3.5 stroke-[3]" />
                    </span>
                    <input type="checkbox" checked={picked.includes(s.user_id)} onChange={() => togglePick(s.user_id)} className="sr-only" />
                    <AvatarInitials name={s.display_name} size="sm" />
                    <span className="truncate text-sm font-medium text-ink-900">{s.display_name}</span>
                  </label>
                ))}
              </div>
            )
          )}

          {/* Individual assignment not opened from a class — for the owner this includes students with no class. */}
          {globalPicker && (
            <div className="mt-1">
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-input px-3 py-2">
                <Search className="size-4 text-ink-400" />
                <input
                  data-testid="assign-student-search"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Tìm học viên theo tên, email…"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              {filteredStudents.length === 0 ? (
                <p className="mt-2 text-sm text-ink-400">Không có học viên phù hợp.</p>
              ) : (
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {filteredStudents.map((s) => (
                    <label key={s.user_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-50">
                      <span className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded border-2",
                        picked.includes(s.user_id) ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300 text-transparent",
                      )}>
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
            </div>
          )}
        </div>

        {/* 3 · deadline & time limit */}
        <div className="shrink-0">
          <div className="mb-2.5 text-[13.5px] font-bold text-ink-900">3 · Hạn nộp &amp; thời gian làm bài</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink-700">Hạn nộp</label>
              <input data-testid="assign-deadline-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
            </div>
            {timeLimitApplies && (
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-ink-700">Thời gian làm bài (phút)</label>
                <input
                  data-testid="assign-time-limit-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  placeholder="Không giới hạn"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  className={inputCls}
                />
                {timeLimitInvalid && (
                  <p className="mt-1 text-xs text-error-700">Thời gian làm bài phải từ 1 đến 240 phút.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onClose}>Hủy</Button>
        <Button data-testid="assign-submit-btn" onClick={() => { setError(null); assign.mutate(); }}
          disabled={!setId || studentIds.length === 0 || assign.isPending || timeLimitInvalid}>
          <Send /> {assign.isPending ? "Đang giao…" : `Giao cho ${studentIds.length} học viên`}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** The displayed set code is derived from the id (RD/LS/WR/SP + 4 hex). */
export function setCode(s: { id: string; skill: string }) {
  const prefix =
    s.skill === "writing" ? "WR" : s.skill === "reading" ? "RD" : s.skill === "listening" ? "LS" : "SP";
  return `${prefix}-${s.id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}
