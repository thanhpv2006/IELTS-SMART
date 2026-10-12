"use client";

import { OctagonX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Strike-2 terminal overlay (design item 2, GC3). Rendered by the host page once the anti-cheat
 * guard has terminated the attempt (current skill force-submitted, remaining skills forfeited for
 * mock). Opaque — no scrim, fully blocks interaction with the exam behind it.
 */
export function ExamEndedOverlay({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md rounded-2xl border border-ink-100 p-8 text-center shadow-lg">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-red-100">
          <OctagonX className="size-7 text-red-600" />
        </div>
        <h2 className="mb-2 text-lg font-bold text-ink-900">Bài thi đã kết thúc do vi phạm</h2>
        <p className="mb-6 text-sm text-ink-500">
          Bạn đã rời màn hình bài thi quá số lần cho phép. Bài làm hiện tại đã được nộp.
        </p>
        <Button size="lg" onClick={onLeave}>
          Về danh sách bài tập
        </Button>
      </div>
    </div>
  );
}
