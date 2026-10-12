"use client";

import { CalendarClock, Lock, RotateCw, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function BulkActionBar({
  count,
  pending,
  onExtend,
  onCloseNow,
  onWithdraw,
  onReassign,
  onClear,
}: {
  count: number;
  pending: boolean;
  onExtend: () => void;
  onCloseNow: () => void;
  onWithdraw: () => void;
  onReassign: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div
      data-testid="bulk-action-bar"
      className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white p-3 shadow-lg"
    >
      <span className="text-[13px] font-medium text-ink-700">
        Đã chọn <strong className="num">{count}</strong> bài
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button data-testid="bulk-extend" size="sm" variant="outline" disabled={pending} onClick={onExtend}>
          <CalendarClock className="size-4" /> Gia hạn
        </Button>
        <Button data-testid="bulk-close" size="sm" variant="outline" disabled={pending} onClick={onCloseNow}>
          <Lock className="size-4" /> Đóng ngay
        </Button>
        <Button data-testid="bulk-reassign" size="sm" variant="outline" disabled={pending} onClick={onReassign}>
          <RotateCw className="size-4" /> Giao lại
        </Button>
        <Button
          data-testid="bulk-withdraw"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onWithdraw}
          className="border-error-200 text-error-700 hover:bg-error-50"
        >
          <Trash2 className="size-4" /> Thu hồi
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Bỏ chọn">
          <X className="size-4" /> Bỏ chọn
        </Button>
      </div>
    </div>
  );
}
