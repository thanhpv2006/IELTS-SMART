"use client";

// Intro screen for a FRESH mock full-test attempt (design item 7) — shown after DeviceCheck,
// right before entering the exam (resume attempts skip both, GC6). Port of ielts88-fulltest's
// Intro.tsx reshaped to Tailwind + this app's copy conventions.

import { Mic, Headphones, BookOpen, PenLine, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SKILL_TIME_LIMITS } from "@/features/take/exam-timing";
import type { MockSkill } from "./types";

// Fixed display order (design item 5): Speaking → Listening → Reading → Writing.
const STEPS: { skill: MockSkill; label: string; icon: typeof Mic }[] = [
  { skill: "speaking", label: "Speaking", icon: Mic },
  { skill: "listening", label: "Listening", icon: Headphones },
  { skill: "reading", label: "Reading", icon: BookOpen },
  { skill: "writing", label: "Writing", icon: PenLine },
];

function durationLabel(skill: MockSkill): string {
  const seconds = SKILL_TIME_LIMITS[skill];
  // Speaking has no fixed section time limit (engine paces per-part instead) — show an
  // approximate duration rather than omitting it, so the step card isn't left blank.
  if (seconds === undefined) return "~15 phút";
  return `${Math.round(seconds / 60)} phút`;
}

export function Intro({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-ink-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-bold text-ink-900">Bài thi thử IELTS</h1>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STEPS.map(({ skill, label, icon: Icon }, i) => (
            <div key={skill} className="rounded-xl border border-ink-200 p-3 text-center">
              <p className="text-[11px] font-semibold tracking-wide text-ink-400">BƯỚC {i + 1}</p>
              <div className="mx-auto mt-2 flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon className="size-4" />
              </div>
              <p className="mt-2 text-sm font-bold text-ink-900">{label}</p>
              <p className="text-xs text-ink-500">{durationLabel(skill)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl bg-ink-50 p-4">
          <p className="text-sm font-bold text-ink-900">Trước khi bắt đầu</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-600">
            <li>
              Bài thi theo thứ tự cố định: <strong>Speaking → Listening → Reading → Writing</strong>.
            </li>
            <li>
              Khi một phần đã nộp, phần đó <strong>không thể mở lại</strong>.
            </li>
            <li>
              Câu trả lời của bạn được <strong>tự động lưu</strong> trong quá trình làm bài.
            </li>
            <li>
              Đồng hồ đếm giờ của mỗi phần chỉ bắt đầu khi bạn <strong>vào phần thi đó</strong>.
            </li>
          </ul>
        </div>

        <Button size="lg" className="mt-6 w-full" onClick={onEnter}>
          Bắt đầu <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
