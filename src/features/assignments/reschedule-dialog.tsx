"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";

export function RescheduleDialog({
  count,
  pending,
  onSubmit,
  onClose,
}: {
  count: number;
  pending: boolean;
  onSubmit: (deadline: string | null) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [clear, setClear] = useState(false);

  const submit = () => onSubmit(clear ? null : new Date(value).toISOString());

  return (
    <Dialog open onClose={onClose} title="Đổi hạn nộp" size="sm">
      <DialogBody className="space-y-4">
        <p className="text-sm text-ink-600">
          Áp dụng cho <strong className="num text-ink-900">{count}</strong> bài đang chọn.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">Hạn nộp mới</span>
          <input
            data-testid="reschedule-input"
            type="datetime-local"
            value={value}
            disabled={clear}
            onChange={(e) => setValue(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-400"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="size-4 rounded border-ink-300 accent-brand-600"
            checked={clear}
            onChange={(e) => setClear(e.target.checked)}
          />
          Bỏ hạn nộp
        </label>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Hủy
        </Button>
        <Button
          data-testid="reschedule-confirm"
          className="ml-auto"
          disabled={pending || (!clear && !value)}
          onClick={submit}
        >
          {pending ? "Đang lưu…" : "Xác nhận"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
