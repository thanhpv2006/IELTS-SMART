"use client";

import { useState } from "react";
import Link from "next/link";
import type { Skill } from "@novaforge-team/ielts-exam-engine";
import { Clock, ListChecks, Target, Gauge, Trophy, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PracticeSet } from "@/features/student/api";
import type { PracticeHistoryEntry } from "@/features/practice/history";
import { SKILL_TIME_LIMITS } from "@/features/take/exam-timing";

const SKILL_LABEL: Record<string, string> = {
  reading: "Reading",
  listening: "Listening",
};

const SKILL_TAG_CLASS: Record<string, string> = {
  reading: "bg-info-50 text-info-700",
  listening: "bg-purple-50 text-purple-700",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

export type PracticeCardProps = {
  set: PracticeSet;
  history?: PracticeHistoryEntry;
  starting: boolean;
  onStart: (timedSeconds?: number) => void;
};

export function PracticeCard({ set, history, starting, onStart }: PracticeCardProps) {
  const [timed, setTimed] = useState(false);

  const handleStart = () => {
    if (!timed) {
      onStart(undefined);
      return;
    }
    const seconds = set.duration_minutes
      ? set.duration_minutes * 60
      : SKILL_TIME_LIMITS[set.skill as Skill];
    onStart(seconds);
  };

  return (
    <Card className="flex flex-col p-4">
      <div className="flex flex-wrap gap-1.5">
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", SKILL_TAG_CLASS[set.skill] ?? "bg-ink-100 text-ink-600")}>
          #{SKILL_LABEL[set.skill] ?? set.skill}
        </span>
      </div>

      <h3 className="mt-2.5 min-h-10 text-[15.5px] font-bold leading-snug text-ink-900">{set.name}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <ListChecks className="size-3.5" /> {set.question_count} câu
        </span>
        {set.duration_minutes != null && (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" /> {set.duration_minutes} phút
          </span>
        )}
        {set.target_band != null && (
          <span className="inline-flex items-center gap-1.5">
            <Target className="size-3.5" /> Band {set.target_band}
          </span>
        )}
        {set.difficulty && (
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="size-3.5" /> {DIFFICULTY_LABEL[set.difficulty] ?? set.difficulty}
          </span>
        )}
      </div>

      {history && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <History className="size-3.5" /> Đã luyện {history.attempts} lần
          </span>
          {history.bestCorrect && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-success-700">
              <Trophy className="size-3.5" /> Cao nhất {history.bestCorrect.raw}/{history.bestCorrect.total} câu
            </span>
          )}
          {history.lastResultId && (
            <Link href={`/student/results/${history.lastResultId}?from=practice`} className="text-brand-600 underline-offset-4 hover:underline">
              Xem kết quả gần nhất
            </Link>
          )}
        </div>
      )}

      <div className="mt-auto pt-4">
        <label className="mb-3 flex items-center gap-2 text-[13px] text-ink-700">
          <input
            type="checkbox"
            checked={timed}
            onChange={(e) => setTimed(e.target.checked)}
            className="size-4 rounded border-input"
          />
          Bấm giờ
        </label>

        <Button className="w-full" disabled={starting} onClick={handleStart}>
          Luyện tập
        </Button>
      </div>
    </Card>
  );
}
