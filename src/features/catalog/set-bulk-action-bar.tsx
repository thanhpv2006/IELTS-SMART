"use client";

import { Archive, ArchiveRestore, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SetBulkActionBar({
  count,
  pending,
  archivedView,
  onArchive,
  onRestore,
  onDelete,
  onClear,
}: {
  count: number;
  pending: boolean;
  archivedView: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div
      data-testid="set-bulk-bar"
      className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white p-3 shadow-lg"
    >
      <span className="text-[13px] font-medium text-ink-700">
        Đã chọn <strong className="num">{count}</strong> đề
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {archivedView ? (
          <Button data-testid="set-bulk-restore" size="sm" variant="outline" disabled={pending} onClick={onRestore}>
            <ArchiveRestore className="size-4" /> Khôi phục
          </Button>
        ) : (
          <Button data-testid="set-bulk-archive" size="sm" variant="outline" disabled={pending} onClick={onArchive}>
            <Archive className="size-4" /> Lưu trữ
          </Button>
        )}
        <Button
          data-testid="set-bulk-delete"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onDelete}
          className="border-error-200 text-error-700 hover:bg-error-50"
        >
          <Trash2 className="size-4" /> Xoá
        </Button>
        <Button data-testid="set-bulk-clear" size="sm" variant="ghost" onClick={onClear} aria-label="Bỏ chọn">
          <X className="size-4" /> Bỏ chọn
        </Button>
      </div>
    </div>
  );
}
