"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Users, GraduationCap, ClipboardList, CheckCircle2,
  BookOpen, Layers, Send, ArrowRight,
} from "lucide-react";
import { dashboardApi } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { POOL_LABELS, POOL_ORDER, POOL_UNITS } from "@/features/partner/credit-pools";
import { DonutChart } from "@/components/ui/donut-chart";
import { ActivityChart, AIScoringChart, completionFromDaily, fmtMs } from "@/features/partner/dashboard-charts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── Operating workflow (CTA shortcuts) ────────────────────────────────────────

const FLOW: { step: string; title: string; desc: string; href: string; icon: typeof Users }[] = [
  { step: "Bước 1", title: "Tạo giáo viên", desc: "Hồ sơ & tài khoản đăng nhập.", href: "/teachers", icon: GraduationCap },
  { step: "Bước 2", title: "Thêm học viên", desc: "Tạo hồ sơ & xếp lớp.", href: "/students", icon: Users },
  { step: "Bước 3", title: "Tạo đề", desc: "Soạn đề vào ngân hàng.", href: "/banks", icon: Layers },
  { step: "Bước 4", title: "Giao bài tập", desc: "Giao đề & cấu hình chấm.", href: "/assignments", icon: Send },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-dashboard", range.from, range.to],
    queryFn: () => dashboardApi.owner(range.from, range.to),
  });

  const growthPct =
    data && (data.assignments_prev_range ?? 0) > 0
      ? Math.round(((data.assignments_this_range - data.assignments_prev_range) / data.assignments_prev_range) * 100)
      : null;

  // Completion donut from the daily totals (real data)
  const { total: completionTotal, donePct, segments: completion } = completionFromDaily(data?.daily ?? []);

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Tổng quan trung tâm</h1>
          <p className="mt-1 text-sm text-ink-500">Theo dõi học viên, giáo viên và tiến độ chấm bài.</p>
        </div>
        <DateRangePicker testId="date-range-picker" value={range} onChange={setRange} />
      </div>

      {isLoading && <p data-testid="dashboard-loading" className="text-sm text-ink-500">Đang tải…</p>}
      {error && <p data-testid="dashboard-error" className="text-sm text-error-700">{errorMessage(error)}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard data-testid="stat-card-students" label="Tổng học viên" value={data.student_total.toLocaleString("vi-VN")}
              icon={<Users />} iconTone="info"
              sub={`${data.student_assigned} đã phân công · ${data.student_unassigned} chưa`} />
            <StatCard data-testid="stat-card-teachers" label="Giáo viên" value={data.teacher_count} icon={<GraduationCap />} iconTone="purple" />
            <StatCard data-testid="stat-card-assignments" label="Bài giao (kỳ này)" value={data.assignments_this_range}
              icon={<ClipboardList />} iconTone="success"
              delta={growthPct !== null ? { value: `${Math.abs(growthPct)}%`, direction: growthPct >= 0 ? "up" : "down" } : undefined}
              sub={growthPct !== null ? "so với kỳ trước" : undefined} />
            <StatCard data-testid="stat-card-submission" label="Tỉ lệ nộp" value={`${Math.round(data.submission_rate * 100)}%`}
              icon={<CheckCircle2 />} iconTone="brand"
              sub={`${data.pending_count} chờ · ${data.overdue_count} quá hạn`} />
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-semibold text-ink-900">Lượt chấm AI còn lại</div>
              <Link href="/credit-packages" className="text-[13px] font-medium text-brand-600 hover:underline">
                Quản lý gói
              </Link>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {POOL_ORDER.map((pool) => (
                <Link
                  key={pool}
                  href="/credit-packages"
                  className="rounded-xl border border-ink-100 px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{POOL_LABELS[pool]}</div>
                  <div className="mt-0.5 text-xl font-extrabold text-ink-900">
                    {(data.credit_balances?.[pool] ?? 0).toLocaleString("vi-VN")}{" "}
                    <span className="text-xs font-semibold text-ink-400">{POOL_UNITS[pool]}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* Activity + completion */}
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card className="p-6">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold text-ink-900">Hoạt động bài giao</div>
                  <div className="mt-0.5 text-[13px] text-ink-500">Số bài đã nộp / chờ / quá hạn mỗi ngày</div>
                </div>
              </div>
              <ActivityChart data={data.daily ?? []} />
            </Card>

            <Card className="p-6">
              <div className="text-base font-semibold text-ink-900">Tỷ lệ hoàn thành bài tập</div>
              <div className="mt-0.5 text-[13px] text-ink-500">Trên tổng bài giao kỳ này</div>
              <div data-testid="donut-completion" className="my-4 flex justify-center">
                <DonutChart data={completion} centerValue={`${donePct}%`} centerSub="đã nộp" />
              </div>
              <div className="flex flex-col gap-2.5">
                {completion.map((c) => (
                  <div key={c.label} className="flex items-center gap-2.5">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: c.color }} />
                    <span className="flex-1 text-[13px] font-medium text-ink-700">{c.label}</span>
                    <span className="text-[13px] font-semibold text-ink-900 num">{c.value}</span>
                    <span className="w-10 text-right text-xs text-ink-400 num">
                      {completionTotal > 0 ? Math.round((c.value / completionTotal) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* AI scoring + teacher performance */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <div className="text-base font-semibold text-ink-900">Thời gian chấm AI</div>
              <div className="mt-0.5 text-[13px] text-ink-500">
                Từ lúc học viên nộp đến khi AI chấm xong
                {data.avg_ai_scoring_ms != null && <> · TB <span className="font-semibold text-ink-700">{fmtMs(data.avg_ai_scoring_ms)}</span></>}
              </div>
              <div className="mt-3"><AIScoringChart data={data.daily_ai_scoring ?? []} /></div>
            </Card>

            <Card className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-base font-semibold text-ink-900">Hiệu suất giáo viên</div>
                <Link href="/teachers" data-testid="view-all-teachers" className="text-[13px] font-semibold text-brand-600 hover:underline">Xem tất cả</Link>
              </div>
              {(data.teachers ?? []).length === 0 ? (
                <p data-testid="teacher-list-empty" className="py-6 text-center text-sm text-ink-400">Chưa có giáo viên.</p>
              ) : (
                <div data-testid="teacher-list" className="flex flex-col gap-0.5">
                  {(data.teachers ?? []).slice(0, 5).map((t) => (
                    <div key={t.user_id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-ink-50">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {(t.display_name || "?").slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold text-ink-900">{t.display_name}</div>
                        <div className="text-xs text-ink-500">{t.student_count} HV · {t.assignments_this_month} bài/tháng</div>
                      </div>
                      <span className="shrink-0 rounded-full border border-success-200 bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
                        {Math.round(t.submission_rate * 100)}% nộp
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Operating workflow */}
          <Card className="p-5">
            <div className="mb-3.5 flex items-center gap-2">
              <BookOpen className="size-[17px] text-brand-500" />
              <span className="text-[15px] font-bold text-ink-900">Quy trình vận hành</span>
              <span className="ml-1.5 hidden text-[12.5px] text-ink-400 sm:inline">Các bước để đưa một lớp vào vận hành.</span>
            </div>
            <div className="flex flex-row items-stretch gap-3">
              {FLOW.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="flex min-w-0 flex-1 items-stretch">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 p-0.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 [&_svg]:size-4">
                          <Icon />
                        </span>
                        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-400">{f.step}</span>
                      </div>
                      <div className="text-[13.5px] font-bold leading-tight text-ink-900">{f.title}</div>
                      <div className="flex-1 text-xs leading-relaxed text-ink-500">{f.desc}</div>
                      <Link href={f.href}
                        data-testid={`process-${f.href.replace(/^\//, "")}`}
                        className="w-full rounded-lg border border-brand-200 bg-brand-50 py-1.5 text-center text-[12.5px] font-semibold text-brand-600 hover:bg-brand-100">
                        Mở
                      </Link>
                    </div>
                    {i < FLOW.length - 1 && (
                      <span className="flex items-center px-1 text-ink-300"><ArrowRight className="size-4" /></span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
