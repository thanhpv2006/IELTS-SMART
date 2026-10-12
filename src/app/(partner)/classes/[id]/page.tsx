"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  FileCheck2,
  GraduationCap,
  Target,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { classApi } from "@/features/partner/api";
import {
  classDateRange,
  levelBadgeClass,
  progressClass,
  studentLabel,
} from "@/features/partner/class-format";
import { AssignedHomeworksList } from "@/features/partner/class-assignments";
import { ClassStudentsDialog } from "@/features/partner/class-students-dialog";
import { AssignDialog } from "@/features/partner/assign-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Pagination } from "@/components/ui/search-pagination";
import type { ReactNode } from "react";

const STUDENT_PAGE_SIZE = 8;
const ASSIGNMENT_PAGE_SIZE = 5;

export default function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({ queryKey: ["classes", id], queryFn: () => classApi.get(id) });

  const [manageStudents, setManageStudents] = useState(false);
  const [giaoBai, setGiaoBai] = useState(false);
  const [studentPage, setStudentPage] = useState(1);

  if (isLoading) {
    return <p className="text-sm text-ink-400">Đang tải lớp học...</p>;
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Card className="p-12 text-center text-sm text-ink-400">Không tìm thấy lớp học này.</Card>
      </div>
    );
  }

  const cls = data;
  const percent = Math.round((cls.completion_rate || 0) * 100);

  const studentTotalPages = Math.max(1, Math.ceil(cls.students.length / STUDENT_PAGE_SIZE));
  const safeStudentPage = Math.min(studentPage, studentTotalPages);
  const pagedStudents = cls.students.slice(
    (safeStudentPage - 1) * STUDENT_PAGE_SIZE,
    safeStudentPage * STUDENT_PAGE_SIZE,
  );

  return (
    <div className="flex flex-col gap-7">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">{cls.name}</h1>
            <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${levelBadgeClass(cls.level)}`}>
              Mục tiêu {cls.level?.replace(/^Band\s*/i, "") || "chưa đặt"}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-500">
            <GraduationCap className="size-4 text-ink-400" />
            {cls.teacher_name ?? "Chưa gán giáo viên"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" className="h-11 px-5" onClick={() => setManageStudents(true)}>
            <UserPlus /> Thêm học viên
          </Button>
          <Button type="button" className="h-11 px-5" onClick={() => setGiaoBai(true)}>
            <FileCheck2 /> Giao bài mới
          </Button>
        </div>
      </div>

      {/* Class details */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatItem icon={<Users className="size-4" />} label="Sĩ số" value={studentLabel(cls)} />
        <StatItem icon={<Target className="size-4" />} label="Trình độ mục tiêu" value={cls.level ?? "Chưa đặt"} />
        <StatItem icon={<ClipboardList className="size-4" />} label="Bài đã giao" value={`${cls.assignment_count || 0} bài`} />
        <StatItem icon={<CalendarDays className="size-4" />} label="Thời gian học" value={classDateRange(cls)} />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
          <span className="flex items-center gap-2 text-ink-600">
            <TrendingUp className="size-4 text-ink-400" /> Tiến độ hoàn thành
          </span>
          <span className="text-ink-900">{percent}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div className={`h-full rounded-full ${progressClass(percent)}`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Student list */}
        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink-900">Danh sách học viên</h2>
            <span className="text-xs font-medium text-ink-400">{cls.students.length} học viên</span>
          </div>
          {cls.students.length === 0 ? (
            <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-ink-200 px-4 py-10 text-center text-sm text-ink-400">
              Chưa có học viên trong lớp.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="max-h-112 divide-y divide-ink-100 overflow-y-auto overscroll-contain rounded-lg border border-ink-200">
                {pagedStudents.map((student) => (
                  <Link
                    key={student.user_id}
                    href={`/students/${student.user_id}`}
                    className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50"
                  >
                    <AvatarInitials name={student.display_name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{student.display_name}</span>
                    {student.email && (
                      <span className="hidden truncate text-xs text-ink-400 sm:block">{student.email}</span>
                    )}
                  </Link>
                ))}
              </div>
              <Pagination page={safeStudentPage} totalPages={studentTotalPages} onChange={setStudentPage} />
            </div>
          )}
        </Card>

        {/* List of assigned work */}
        <Card className="flex flex-col p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-ink-900">Bài tập đã giao</h2>
          </div>
          <AssignedHomeworksList cls={cls} pageSize={ASSIGNMENT_PAGE_SIZE} maxHeight="max-h-112" />
        </Card>
      </div>

      {manageStudents && <ClassStudentsDialog cls={cls} onClose={() => setManageStudents(false)} />}
      {giaoBai && <AssignDialog lockedClass={cls} onClose={() => setGiaoBai(false)} />}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/classes"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
    >
      <ArrowLeft className="size-4" /> Quản lý lớp học
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
