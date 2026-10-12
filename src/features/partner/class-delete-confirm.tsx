"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const SKIP_KEY = "ielts_smart_skip_class_delete_confirm";

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shouldSkipDeleteConfirm(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SKIP_KEY) === todayLocal();
}

export function rememberSkipDeleteToday(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SKIP_KEY, todayLocal());
}

export function ClassDeleteConfirm({
  count,
  error,
  pending,
  onConfirm,
  onCancel,
}: {
  count: number;
  error: string | null;
  pending: boolean;
  onConfirm: (skipToday: boolean) => void;
  onCancel: () => void;
}) {
  const [skipChecked, setSkipChecked] = useState(false);

  const message =
    count === 1
      ? "Bạn có chắc muốn xóa lớp đã chọn? Hành động này không thể hoàn tác."
      : `Bạn có chắc muốn xóa ${count} lớp đã chọn? Hành động này không thể hoàn tác.`;

  return (
    <Dialog
      open
      onClose={() => {
        if (!pending) onCancel();
      }}
      title="Xác nhận xóa"
      size="sm"
      hideHeader
    >
      <DialogBody className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-error-50 text-error-600">
            <Trash2 className="size-5" />
          </span>
          <h2 className="font-semibold text-ink-900">Xác nhận xóa</h2>
        </div>
        <p className="text-sm text-ink-600">{message}</p>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={skipChecked}
            onChange={(e) => setSkipChecked(e.target.checked)}
          />
          <span className="text-sm text-ink-600">Không hỏi lại trong ngày hôm nay</span>
        </label>
        {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          Hủy
        </Button>
        <Button variant="destructive" onClick={() => onConfirm(skipChecked)} disabled={pending}>
          {pending ? "Đang xóa..." : "Xóa"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
