"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { resultApi } from "@/features/partner/api";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { isMockResult } from "@/features/mock/mock-result-types";
import { ManualGradingTag } from "@/features/assignments/manual-grading-tag";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  approved: "bg-green-50 text-green-700",
};

type OriginFilter = "all" | "assigned" | "self_practice";

const ORIGIN_FILTERS: { key: OriginFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "assigned", label: "Bài giao" },
  { key: "self_practice", label: "Tự luyện" },
];

export default function ResultsPage() {
  const role = useAuthStore((s) => s.role);
  const isOwner = role === "partner_owner";
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["results", originFilter],
    queryFn: () => resultApi.list({ origin: originFilter === "all" ? undefined : originFilter }),
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-ink-900">Kết quả chấm bài</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {ORIGIN_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setOriginFilter(f.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              originFilter === f.key
                ? "border-brand-200 bg-brand-50 text-brand-600"
                : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-500">Đang tải...</p>
      ) : results.length === 0 ? (
        <p data-testid="results-empty" className="text-sm text-ink-500">Chưa có kết quả nào.</p>
      ) : (
        <div className="rounded-xl border border-ink-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50">
                <th className="px-4 py-3 text-left font-medium text-ink-600">Học sinh</th>
                <th className="px-4 py-3 text-left font-medium text-ink-600">Trạng thái</th>
                {isOwner && (
                  <th className="px-4 py-3 text-right font-medium text-ink-600">Credit đã trừ</th>
                )}
                <th className="px-4 py-3 text-left font-medium text-ink-600">Tạo lúc</th>
                <th className="px-4 py-3 text-right font-medium text-ink-600">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                // A Mock Test result nests all 4 skills (`.skills`) — it is not the flat
                // single-skill shape. The list row already carries `result` (EffectiveResult), so it can be
                // detected right here without another fetch.
                const mockPayload = isMockResult(r.result) ? r.result : null;
                const isMock = mockPayload !== null;
                const mockBand = mockPayload ? (r.band ?? mockPayload.overall_band) : undefined;
                return (
                <tr key={r.id} data-testid={`result-row-${r.id}`} className="border-b border-ink-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.student_name ? (
                        <span className="font-medium text-ink-800">{r.student_name}</span>
                      ) : (
                        <span className="font-mono text-xs text-ink-400">{r.id.slice(0, 12)}…</span>
                      )}
                      {isMock && (
                        <Badge data-testid={`result-mock-badge-${r.id}`} tone="brand">Mock</Badge>
                      )}
                      {r.origin === "self_practice" && (
                        <Badge data-testid={`result-origin-badge-${r.id}`} tone="gray">Tự luyện</Badge>
                      )}
                    </div>
                    {isMock && typeof mockBand === "number" && (
                      <div className="mt-0.5 text-xs font-semibold text-ink-500">Band {mockBand.toFixed(1)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span data-testid={`result-status-${r.id}`} className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.review_status] ?? "bg-ink-100 text-ink-600"}`}>
                        {r.review_status === "pending" ? "Chờ review" : "Đã duyệt"}
                      </span>
                      {r.grading_mode === "manual" && <ManualGradingTag />}
                    </div>
                  </td>
                  {isOwner && (
                    <td className="px-4 py-3 text-right">
                      {r.credits_consumed > 0 ? (
                        <span data-testid={`result-credit-${r.id}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {r.credits_consumed} credit
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-ink-500">
                    {new Date(r.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/results/${r.id}`}
                      data-testid={`result-review-link-${r.id}`}
                      className="rounded-lg border border-brand-200 px-2.5 py-1 text-xs text-brand-600 hover:bg-brand-50"
                    >
                      Xem & Review
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
