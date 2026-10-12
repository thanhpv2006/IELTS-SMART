"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ArrowRight } from "lucide-react";
import { studentAssignmentApi, studentResultApi } from "@/features/student/api";
import { takeHref } from "@/features/student/take-href";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MANUAL_GRADING_STUDENT_LABEL } from "@/features/assignments/assignment-format";
import { cn } from "@/lib/utils";

const DONE_STATUSES = new Set(["released"]);
const GRADING_STATUSES = new Set(["submitted", "scored", "reviewed"]);

// Demo seed catalog set IDs (Reading/Listening) — xem ielts-smart-backend seed data.
const READING_SET_ID = "11111111-1111-4111-8111-111111111101";
const LISTENING_SET_ID = "11111111-1111-4111-8111-111111111102";

function dueSoon(deadline?: string): boolean {
  if (!deadline) return false;
  const ms = new Date(deadline).getTime() - Date.now();
  return ms > 0 && ms < 3 * 24 * 60 * 60 * 1000;
}

export default function StudentDashboardPage() {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["student-assignments", "assigned"],
    queryFn: () => studentAssignmentApi.list({ origin: "assigned" }),
  });
  const { data: results = [] } = useQuery({
    queryKey: ["student-results"],
    queryFn: studentResultApi.list,
    enabled: assignments.some((a) => a.status === "released"),
  });

  const resultIdByAssignment = useMemo(
    () => Object.fromEntries(results.filter((r) => r.assignment_id).map((r) => [r.assignment_id!, r.id])),
    [results],
  );

  const pending = assignments.filter((a) => a.status === "pending");
  const grading = assignments.filter((a) => GRADING_STATUSES.has(a.status));
  const done = assignments.filter((a) => DONE_STATUSES.has(a.status));
  const stats = {
    pending: pending.length,
    dueSoon: pending.filter((a) => dueSoon(a.deadline)).length,
    grading: assignments.filter((a) => GRADING_STATUSES.has(a.status)).length,
    done: done.length,
  };

  return (
    <div className="flex flex-col gap-7">
      {/* Hero */}
      <Card className="flex flex-wrap items-center justify-between gap-6 p-6">
        <div className="min-w-[260px] flex-1">
          <h1 className="text-[23px] font-bold tracking-tight text-ink-900">Chào bạn 👋</h1>
          <p className="mt-1.5 text-sm text-ink-500">Hoàn thành bài tập được giao để nhận band &amp; nhận xét từ AI và giáo viên.</p>
        </div>
        {pending[0] && (
          <Button data-testid="next-assignment-btn" asChild>
            <Link href={takeHref(pending[0])}>Làm bài tiếp theo <ArrowRight /></Link>
          </Button>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card data-testid="student-stat-pending" className="p-5">
          <div className="text-[13px] font-medium text-ink-500">Bài tập cần làm</div>
          <div className="mt-2 text-2xl font-bold text-ink-900 num">{stats.pending}</div>
        </Card>
        <Card data-testid="student-stat-due-soon" className="border-warning-200 bg-warning-50 p-5">
          <div className="text-[13px] font-medium text-warning-700">Sắp hết hạn</div>
          <div className="mt-2 text-2xl font-bold text-warning-700 num">{stats.dueSoon}</div>
        </Card>
        <Card data-testid="student-stat-grading" className="p-5">
          <div className="text-[13px] font-medium text-ink-500">Đang chờ chấm</div>
          <div className="mt-2 text-2xl font-bold text-ink-900 num">{stats.grading}</div>
        </Card>
        <Card data-testid="student-stat-done" className="p-5">
          <div className="text-[13px] font-medium text-ink-500">Bài đã hoàn thành</div>
          <div className="mt-2 text-2xl font-bold text-ink-900 num">{stats.done}</div>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-400">Đang tải…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* To do */}
          <Card className="p-6">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="text-base font-semibold text-ink-900">Cần làm</div>
              <Badge tone="brand">{pending.length} bài</Badge>
            </div>
            {pending.length === 0 ? (
              <p data-testid="assignments-empty" className="py-6 text-center text-sm text-ink-400">Bạn đã làm hết bài được giao 🎉</p>
            ) : (
              <div className="flex flex-col gap-1">
                {pending.slice(0, 6).map((a) => (
                  <div key={a.id} data-testid={`assignment-card-${a.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-ink-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink-900">{a.test_name || `Bài tập #${a.id.slice(0, 8)}`}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                        <CalendarDays className="size-3.5" />
                        {a.deadline ? `Hạn ${new Date(a.deadline).toLocaleDateString("vi-VN")}` : "Không hạn"}
                        {dueSoon(a.deadline) && <Badge data-testid={`deadline-badge-${a.id}`} tone="warning">Sắp hết hạn</Badge>}
                      </div>
                    </div>
                    <Button data-testid={`take-btn-${a.id}`} asChild size="sm"><Link href={takeHref(a)}>Làm bài</Link></Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Submitted — awaiting scoring */}
          <Card className="p-6">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="text-base font-semibold text-ink-900">Đã làm</div>
              <Badge tone="gray">{grading.length} bài</Badge>
            </div>
            {grading.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">Không có bài nào chờ chấm.</p>
            ) : (
              <div className="flex flex-col">
                {grading.slice(0, 6).map((a) => {
                  const manualPending = a.grading_mode === "manual";
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex gap-3 border-b border-ink-100 py-3 last:border-0",
                        manualPending ? "items-start" : "items-center",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold text-ink-900">{a.test_name || `Bài tập #${a.id.slice(0, 8)}`}</div>
                        <div className="mt-0.5 text-xs text-ink-500">Đang chờ chấm</div>
                      </div>
                      {manualPending ? (
                        <Badge tone="warning" className="whitespace-normal text-right leading-snug">
                          {MANUAL_GRADING_STUDENT_LABEL}
                        </Badge>
                      ) : (
                        <Badge tone="info">Chờ chấm</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Scored */}
          <Card className="p-6">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="text-base font-semibold text-ink-900">Đã chấm</div>
              <Badge tone="gray">{done.length} bài</Badge>
            </div>
            {done.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">Chưa có bài nào có kết quả.</p>
            ) : (
              <div className="flex flex-col">
                {done.slice(0, 6).map((a) => {
                  const rid = resultIdByAssignment[a.id];
                  return (
                    <div key={a.id} className="flex items-center gap-3 border-b border-ink-100 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold text-ink-900">{a.test_name || `Bài tập #${a.id.slice(0, 8)}`}</div>
                        <div className="mt-0.5 text-xs text-ink-500">Có kết quả</div>
                      </div>
                      {rid && (
                        <Link href={`/student/results/${rid}`} className="text-[13px] font-semibold text-brand-600 hover:underline">
                          Xem
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Demo Reading/Listening */}
      <Card className="p-6">
        <div className="mb-3.5 text-base font-semibold text-ink-900">Luyện Listening/Reading (demo)</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/student/take-demo/${READING_SET_ID}`}
            className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-3 hover:bg-ink-50"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink-900">Đề Reading (demo)</div>
              <div className="mt-0.5 text-xs text-ink-500">Luyện tập + chấm điểm tự động</div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-ink-400" />
          </Link>
          <Link
            href={`/student/take-demo/${LISTENING_SET_ID}`}
            className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-3 hover:bg-ink-50"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink-900">Đề Listening (demo)</div>
              <div className="mt-0.5 text-xs text-ink-500">Luyện tập + chấm điểm tự động</div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-ink-400" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
