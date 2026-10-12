"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Users, CheckCircle2, Clock, AlertTriangle, Layers, Send, ArrowRight, BookOpen, ClipboardList } from "lucide-react";
import { dashboardApi, resultApi } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DonutChart } from "@/components/ui/donut-chart";
import { ActivityChart, AIScoringChart, completionFromDaily, fmtMs } from "@/features/partner/dashboard-charts";

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

const FLOW: { step: string; title: string; desc: string; href: string; icon: typeof Users }[] = [
  { step: "Bước 1", title: "Thêm học viên", desc: "Tạo hồ sơ học viên lớp bạn.", href: "/my-students", icon: Users },
  { step: "Bước 2", title: "Tạo đề", desc: "Soạn đề vào ngân hàng.", href: "/banks", icon: Layers },
  { step: "Bước 3", title: "Giao bài tập", desc: "Giao đề & cấu hình chấm.", href: "/assignments", icon: Send },
];

export default function MyDashboardPage() {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-dashboard", range.from, range.to],
    queryFn: () => dashboardApi.teacher(range.from, range.to),
  });
  const { data: results = [] } = useQuery({
    queryKey: ["teacher-results-pending"],
    queryFn: () => resultApi.list(),
  });
  const needGrading = results.filter((r) => r.review_status === "pending").length;

  const { total: completionTotal, donePct, segments: completion } = completionFromDaily(data?.daily ?? []);

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Tổng quan lớp</h1>
          <p className="mt-1 text-sm text-ink-500">Theo dõi tiến độ nộp bài và thời gian chấm của lớp bạn phụ trách.</p>
        </div>
        <DateRangePicker testId="date-range-picker" value={range} onChange={setRange} />
      </div>

      {/* Work to score — quick action (D4) */}
      {needGrading > 0 ? (
        <Card data-testid="need-grading-card" className="flex flex-wrap items-center justify-between gap-4 border-brand-200 bg-brand-50/60 p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 [&_svg]:size-5">
              <ClipboardList />
            </span>
            <div>
              <div className="text-[15px] font-bold text-ink-900">
                Bạn có <span className="num text-brand-600">{needGrading}</span> bài cần chấm
              </div>
              <div className="text-[13px] text-ink-500">Học viên đã nộp bài — chờ bạn duyệt.</div>
            </div>
          </div>
          <Link
            href="/results"
            data-testid="need-grading-action"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Chấm ngay <ArrowRight className="size-4" />
          </Link>
        </Card>
      ) : (
        <Card data-testid="need-grading-card" className="flex items-center gap-3 p-4">
          <CheckCircle2 className="size-4.5 text-success-600" />
          <span className="text-[13.5px] text-ink-500">Không có bài nào chờ chấm 🎉</span>
        </Card>
      )}

      {isLoading && <p data-testid="dashboard-loading" className="text-sm text-ink-500">Đang tải…</p>}
      {error && <p data-testid="dashboard-error" className="text-sm text-error-700">{errorMessage(error)}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard data-testid="stat-card-students" label="Học viên" value={data.student_count} icon={<Users />} iconTone="info" />
            <StatCard data-testid="stat-card-submission" label="Tỉ lệ nộp" value={`${Math.round(data.submission_rate * 100)}%`} icon={<CheckCircle2 />} iconTone="success" />
            <StatCard data-testid="stat-card-pending" label="Chờ nộp" value={data.pending_count} icon={<Clock />} iconTone="warning" />
            <StatCard data-testid="stat-card-overdue" label="Quá hạn" value={data.overdue_count} icon={<AlertTriangle />} iconTone="purple" />
          </div>

          {/* Activity + completion */}
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card className="p-6">
              <div className="text-base font-semibold text-ink-900">Hoạt động bài giao</div>
              <div className="mt-0.5 mb-2 text-[13px] text-ink-500">Số bài đã nộp / chờ / quá hạn mỗi ngày</div>
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

          {/* AI scoring */}
          <Card className="p-6">
            <div className="text-base font-semibold text-ink-900">Thời gian chấm AI</div>
            <div className="mt-0.5 text-[13px] text-ink-500">
              Từ lúc học viên nộp đến khi AI chấm xong
              {data.avg_ai_scoring_ms != null && <> · TB <span className="font-semibold text-ink-700">{fmtMs(data.avg_ai_scoring_ms)}</span></>}
            </div>
            <div className="mt-3"><AIScoringChart data={data.daily_ai_scoring ?? []} /></div>
          </Card>

          {/* Operating workflow */}
          <Card className="p-5">
            <div className="mb-3.5 flex items-center gap-2">
              <BookOpen className="size-4.5 text-brand-500" />
              <span className="text-[15px] font-bold text-ink-900">Quy trình vận hành</span>
              <span className="ml-1.5 hidden text-[12.5px] text-ink-400 sm:inline">Các bước để bắt đầu dạy và giao bài cho lớp của bạn.</span>
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
