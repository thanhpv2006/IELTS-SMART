"use client";

import { use, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ClipboardList, Clock, GraduationCap, Mail, Phone, Target } from "lucide-react";
import {
  assignmentApi,
  dashboardApi,
  resultApi,
  studentApi,
  type Assignment,
  type AssignmentResult,
} from "@/features/partner/api";
import { displayScore, GateFailTag, isGateWithheld } from "@/features/partner/test-results-dialog";
import { ManualGradingTag } from "@/features/assignments/manual-grading-tag";
import { ResultReviewModal } from "@/app/(partner)/results/[id]/page";
import { isMockResult } from "@/features/mock/mock-result-types";
import { MockResultReview } from "@/features/mock/mock-result-review";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Pagination } from "@/components/ui/search-pagination";

const PAGE_SIZE = 8;
const SUBMITTED = new Set(["submitted", "scored", "reviewed", "released"]);
const REVIEWED = new Set(["reviewed", "released"]);

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const isOwner = useAuthStore((s) => s.role === "partner_owner");

  const { data: students = [], isLoading: loadingStudent } = useQuery({
    queryKey: isOwner ? ["students"] : ["my-students"],
    queryFn: isOwner ? studentApi.list : dashboardApi.myStudents,
  });
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({ queryKey: ["assignments"], queryFn: () => assignmentApi.list() });
  const { data: results = [] } = useQuery({ queryKey: ["results"], queryFn: () => resultApi.list() });

  const [page, setPage] = useState(1);
  const [openResultId, setOpenResultId] = useState<string | null>(null);

  const student = useMemo(() => students.find((s) => s.user_id === id), [students, id]);

  const studentAssignments = useMemo(
    () =>
      assignments
        .filter((a) => a.student_id === id)
        .sort((x, y) => (y.created_at ?? "").localeCompare(x.created_at ?? "")),
    [assignments, id],
  );
  const resultByAssignment = useMemo(
    () => new Map(results.filter((r) => r.assignment_id).map((r) => [r.assignment_id!, r])),
    [results],
  );

  const totalPages = Math.max(1, Math.ceil(studentAssignments.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedAssignments = studentAssignments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const backHref = isOwner ? "/students" : "/my-students";

  // A Mock Test (several skills, purpose='mock') can land in this list —
  // it must be opened with `MockResultReview`, not `ResultReviewModal` (single-skill),
  // otherwise it renders wrong and may corrupt the payload on save.
  const openResult = openResultId ? results.find((r) => r.id === openResultId) ?? null : null;
  const openIsMock = !!openResult && isMockResult(openResult.result);
  const closeOpenResult = () => {
    setOpenResultId(null);
    qc.invalidateQueries({ queryKey: ["results"] });
  };

  if (loadingStudent) {
    return <p className="text-sm text-ink-400">Đang tải học viên...</p>;
  }
  if (!student) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href={backHref} />
        <Card className="p-12 text-center text-sm text-ink-400">Không tìm thấy học viên này.</Card>
      </div>
    );
  }

  const done = student.assignment_done || 0;
  const total = student.assignment_total || 0;
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="flex flex-col gap-7">
      <BackLink href={backHref} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <AvatarInitials name={student.display_name} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">{student.display_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
              {student.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="size-4 text-ink-400" /> {student.email}
                </span>
              )}
              {student.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-4 text-ink-400" /> {student.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Student details */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatItem
          icon={<GraduationCap className="size-4" />}
          label="Lớp"
          value={
            student.classes.length === 0 ? (
              <span className="text-ink-400">Chưa xếp lớp</span>
            ) : (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {student.classes.map((c) => (
                  <span
                    key={c.id}
                    className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-700"
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )
          }
        />
        <StatItem icon={<Target className="size-4" />} label="Trình độ hiện tại" value={student.current_level ?? "Chưa đặt"} />
        <StatItem icon={<ClipboardList className="size-4" />} label="Band hiện tại" value={student.current_band?.toFixed(1) ?? "--"} />
        <StatItem icon={<CalendarDays className="size-4" />} label="Ngày thêm" value={formatDate(student.created_at)} />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
          <span className="text-ink-600">Tiến độ hoàn thành bài tập</span>
          <span className="text-ink-900">{done}/{total} bài ({percent}%)</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
        </div>
      </Card>

      {/* List of assigned work (both by class and individually) */}
      <Card className="flex flex-col p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink-900">Bài tập đã giao</h2>
          <span className="text-xs font-medium text-ink-400">{studentAssignments.length} bài</span>
        </div>
        {loadingAssignments ? (
          <p className="py-8 text-center text-sm text-ink-400">Đang tải bài tập...</p>
        ) : studentAssignments.length === 0 ? (
          <p className="flex items-center justify-center rounded-lg border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
            Chưa có bài tập nào được giao cho học viên này.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200">
              {pagedAssignments.map((a) => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  result={resultByAssignment.get(a.id)}
                  onViewResult={setOpenResultId}
                />
              ))}
            </div>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </Card>

      {openResultId && openIsMock && (
        <MockResultReview resultId={openResultId} onClose={closeOpenResult} />
      )}
      {openResultId && !openIsMock && (
        <ResultReviewModal id={openResultId} onClose={closeOpenResult} />
      )}
    </div>
  );
}

function AssignmentRow({
  assignment,
  result,
  onViewResult,
}: {
  assignment: Assignment;
  result?: AssignmentResult;
  onViewResult: (id: string) => void;
}) {
  const status = assignmentStatus(assignment);
  // Reading/Listening are auto-graded and auto-released — the teacher only ever views them, never
  // "đánh giá". Speaking/writing keep the review action until reviewed/released.
  const isObjective = assignment.skill === "reading" || assignment.skill === "listening";
  const viewOnly = REVIEWED.has(assignment.status) || isObjective;
  const score = result ? displayScore(result) : null;
  return (
    <div className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_56px_120px]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone={assignment.skill ? (assignment.skill === "speaking" ? "info" : "purple") : "gray"} className="uppercase">
            {assignment.skill || "—"}
          </Badge>
          <span className="truncate text-sm font-semibold text-ink-900">
            {assignment.test_name || `Đề ${assignment.test_id.slice(0, 8)}`}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
          <Clock className="size-3.5" />
          <span>
            {assignment.created_at ? `Giao ${shortDateTime(assignment.created_at)}` : ""}
            {assignment.deadline ? ` · Hạn ${shortDateTime(assignment.deadline)}` : ""}
          </span>
          {/* Class label — frozen at assignment time, shown even for a class the student has left */}
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${assignment.class_name ? "border-brand-200 bg-brand-50 text-brand-600" : "border-ink-200 bg-ink-50 text-ink-500"}`}>
            {assignment.class_name ?? "Giao lẻ"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>
          {status.label}
        </span>
        {result && result.grading_mode === "manual" ? (
          <ManualGradingTag />
        ) : (
          result && isGateWithheld(result) && <GateFailTag gate={result.gate} />
        )}
      </div>
      <span className="text-center text-base font-bold text-ink-900">{score ?? "—"}</span>
      {result ? (
        <Button size="sm" variant={viewOnly ? "outline" : "default"} onClick={() => onViewResult(result.id)}>
          {viewOnly ? "Xem kết quả" : "Đánh giá"}
        </Button>
      ) : SUBMITTED.has(assignment.status) ? (
        <Button size="sm" disabled>Đang xử lý</Button>
      ) : (
        <span className="text-center text-xs text-ink-400">Chưa nộp</span>
      )}
    </div>
  );
}

function assignmentStatus(a: Assignment): { label: string; cls: string } {
  if (REVIEWED.has(a.status)) return { label: "Đã đánh giá", cls: "border-success-200 bg-success-50 text-success-700" };
  if (SUBMITTED.has(a.status)) return { label: "Chờ đánh giá", cls: "border-warning-200 bg-warning-50 text-warning-700" };
  if (a.deadline && Date.now() > new Date(a.deadline).getTime())
    return { label: "Quá hạn", cls: "border-error-200 bg-error-50 text-error-700" };
  return { label: "Chưa nộp", cls: "border-ink-200 bg-ink-100 text-ink-500" };
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
    >
      <ArrowLeft className="size-4" /> Quản lý học viên
    </Link>
  );
}

function StatItem({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/60 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
        <span className="text-ink-400">{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "--";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function shortDateTime(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
