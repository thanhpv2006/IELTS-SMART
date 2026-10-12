"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tab resume-gate shown by the page-level anti-cheat guard the first time the student leaves the
 * exam tab (strike 1). While it is up the page blurs the exam content behind it and pauses audio;
 * clicking "Tiếp tục làm bài" (`onContinue`) reveals the content and resumes audio. A second
 * leave-tab terminates the attempt instead (design GC1/GC8). Style mirrors `FullscreenGate` for a
 * consistent gate look.
 */
export function AntiCheatWarningModal({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-amber-100">
          <TriangleAlert className="size-7 text-amber-600" />
        </div>
        <h2 className="mb-2 text-lg font-bold text-ink-900">Bạn đã rời khỏi bài thi</h2>
        <p className="mb-6 text-sm text-ink-500">
          Bạn đã rời màn hình làm bài 1 lần. Nếu rời lần nữa, bài thi sẽ bị kết thúc. Nhấn để tiếp
          tục.
        </p>
        <Button size="lg" onClick={onContinue}>
          Tiếp tục làm bài
        </Button>
      </div>
    </div>
  );
}
