"use client";

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyItem, DailyAIScoringItem } from "@/features/partner/api";
import { useBrand } from "@/brand/context";

export function fmtMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}p ${s}s` : `${m}p`;
}

export const dayLabel = (day: string) => day.slice(5); // MM-DD

/** Bar chart of work assigned per day (submitted / waiting / overdue). */
export function ActivityChart({ data }: { data: DailyItem[] }) {
  const chartData = data.map((d) => ({
    day: dayLabel(d.day),
    "Đã nộp": d.submitted,
    "Chờ nộp": d.pending,
    "Quá hạn": d.overdue,
  }));
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barSize={7}>
        <CartesianGrid vertical={false} stroke="#F2F4F7" />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#98A2B3" }} tickLine={false} axisLine={false}
          interval={Math.max(0, Math.floor(data.length / 6))} />
        <YAxis tick={{ fontSize: 11, fill: "#98A2B3" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #EAECF0" }} cursor={{ fill: "#F9FAFB" }} />
        <Bar dataKey="Đã nộp" stackId="a" fill="#12B76A" />
        <Bar dataKey="Chờ nộp" stackId="a" fill="#FEC84B" />
        <Bar dataKey="Quá hạn" stackId="a" fill="#F97066" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Line chart of the average AI scoring time (seconds). */
export function AIScoringChart({ data }: { data: DailyAIScoringItem[] }) {
  const brand = useBrand();
  const hasData = data.some((d) => d.avg_ms != null);
  const chartData = data.map((d) => ({ day: dayLabel(d.day), avgSec: d.avg_ms != null ? Math.round(d.avg_ms / 1000) : null }));
  if (!hasData) {
    return (
      <div className="flex h-[190px] items-center justify-center rounded-lg border border-dashed border-ink-200">
        <p className="text-sm text-ink-400">Chưa có dữ liệu chấm trong kỳ này</p>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#F2F4F7" />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#98A2B3" }} tickLine={false} axisLine={false}
          interval={Math.max(0, Math.floor(data.length / 6))} />
        <YAxis tick={{ fontSize: 11, fill: "#98A2B3" }} tickLine={false} axisLine={false} unit="s" />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #EAECF0" }} formatter={(v) => [`${v}s`, "Avg chấm"]} />
        <Line type="monotone" dataKey="avgSec" stroke={brand.palette["--brand-500"]} strokeWidth={2.5} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Completion donut segments computed from the daily totals. */
export function completionFromDaily(daily: DailyItem[]) {
  const totals = daily.reduce(
    (a, d) => ({ done: a.done + d.submitted, doing: a.doing + d.pending, miss: a.miss + d.overdue }),
    { done: 0, doing: 0, miss: 0 },
  );
  const total = totals.done + totals.doing + totals.miss;
  return {
    total,
    donePct: total > 0 ? Math.round((totals.done / total) * 100) : 0,
    segments: [
      { label: "Đã nộp", value: totals.done, color: "#12B76A" },
      { label: "Đang làm", value: totals.doing, color: "#FEC84B" },
      { label: "Quá hạn", value: totals.miss, color: "#F97066" },
    ],
  };
}
