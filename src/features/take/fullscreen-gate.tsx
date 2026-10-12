"use client";

import { Maximize, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const COPY: Record<"start" | "resume", { title: string; body: string }> = {
  start: {
    title: "Chế độ toàn màn hình",
    body: "Bài thi này yêu cầu làm ở chế độ toàn màn hình. Nhấn để bắt đầu.",
  },
  resume: {
    title: "Cảnh báo: đã thoát toàn màn hình",
    body: "Bạn đã thoát toàn màn hình bài thi 1 lần. Nếu thoát lần nữa, bài thi sẽ bị kết thúc. Nhấn để vào lại toàn màn hình.",
  },
};

/**
 * Full-bleed gate shown by `ExamSkillRunner` when the per-center `fullscreen` policy is on.
 * Fullscreen must be entered via a user gesture (browser restriction), so this overlay's button
 * click is that gesture — see design D2. Style mirrors `mic-test.tsx` for a consistent
 * pre-exam-screen look across gates.
 */
export function FullscreenGate({
  mode,
  onEnter,
}: {
  mode: "start" | "resume";
  onEnter: () => void;
}) {
  const { title, body } = COPY[mode];
  // "resume" mode is a violation warning (student exited fullscreen mid-exam) → amber alert
  // styling consistent with the leave-tab modal; "start" mode is a neutral pre-exam prompt.
  const isWarn = mode === "resume";
  const Icon = isWarn ? TriangleAlert : Maximize;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div
          className={`mx-auto mb-6 flex size-16 items-center justify-center rounded-full ${
            isWarn ? "bg-amber-100" : "bg-brand-100"
          }`}
        >
          <Icon className={`size-7 ${isWarn ? "text-amber-600" : "text-brand-600"}`} />
        </div>
        <h2 className="mb-2 text-lg font-bold text-ink-900">{title}</h2>
        <p className="mb-6 text-sm text-ink-500">{body}</p>
        <Button size="lg" data-testid="fullscreen-enter-btn" onClick={onEnter}>
          <Maximize /> Vào toàn màn hình
        </Button>
      </div>
    </div>
  );
}
