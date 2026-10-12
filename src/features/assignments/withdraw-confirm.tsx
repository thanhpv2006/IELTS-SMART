"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";

export function WithdrawConfirm({
  pendingCount,
  submittedCount,
  busy,
  onConfirm,
  onClose,
}: {
  pendingCount: number;
  submittedCount: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} title="Thu hồi bài tập" size="sm">
      <DialogBody className="space-y-3">
        <p className="text-sm text-ink-700">
          Sẽ xóa <strong className="num text-error-700">{pendingCount}</strong> bài học viên chưa làm.
        </p>
        {submittedCount > 0 && (
          <p className="rounded-lg bg-ink-50 p-3 text-[13px] text-ink-600">
            <strong className="num text-ink-900">{submittedCount}</strong> bài đã có học viên nộp sẽ
            được giữ nguyên — thu hồi không đụng tới bài đã nộp.
          </p>
        )}
        <p className="text-[13px] text-ink-500">Thao tác này không hoàn tác được.</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Hủy
        </Button>
        <Button
          data-testid="withdraw-confirm"
          variant="destructive"
          className="ml-auto"
          disabled={busy || pendingCount === 0}
          onClick={onConfirm}
        >
          {busy ? "Đang thu hồi…" : "Thu hồi"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
