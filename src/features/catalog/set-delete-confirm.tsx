"use client";

import { Trash2 } from "lucide-react";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SetDeleteConfirm({
  count,
  pending,
  onConfirm,
  onCancel,
}: {
  count: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const question = count === 1 ? "Xoá đề đã chọn?" : `Xoá ${count} đề đã chọn?`;

  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onCancel();
      }}
      title="Xoá bộ đề"
      size="sm"
      hideHeader
    >
      <DialogBody className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-error-50 text-error-600">
            <Trash2 className="size-5" />
          </span>
          <h2 className="font-semibold text-ink-900">Xoá bộ đề</h2>
        </div>
        <div className="space-y-1 text-sm text-ink-600">
          <p className="font-medium text-ink-800">{question}</p>
          <p>
            Đề sẽ biến mất khỏi Ngân hàng đề và không khôi phục được. Bài đã giao cho học viên vẫn giữ
            nguyên kết quả.
          </p>
        </div>
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Huỷ
        </Button>
        <Button data-testid="set-delete-confirm" variant="destructive" onClick={onConfirm} disabled={pending}>
          {pending ? "Đang xoá…" : "Xoá"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
