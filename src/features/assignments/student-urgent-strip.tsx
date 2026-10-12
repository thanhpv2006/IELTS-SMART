"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudentAssignment } from "@/features/student/api";
import { takeHref } from "@/features/student/take-href";
import { deadlineLabel, isOverdue } from "@/features/assignments/deadline";
import { skillLabelOf, skillToneOf } from "@/features/assignments/assignment-format";

const MAX_SHOWN = 3;

/** Renders the already-filtered urgent set; it never decides what counts as urgent. */
export function StudentUrgentStrip({ items }: { items: StudentAssignment[] }) {
  if (items.length === 0) return null;

  const soonest = [...items]
    .sort((a, b) => new Date(a.deadline ?? 0).getTime() - new Date(b.deadline ?? 0).getTime())
    .slice(0, MAX_SHOWN);

  return (
    <Card data-testid="urgent-strip" className="border-warning-200 bg-warning-50/40 p-4">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-warning-700" />
        <h2 className="text-sm font-bold text-ink-900">Cần làm ngay</h2>
        <span className="num text-xs text-ink-500">({items.length})</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {soonest.map((a) => {
          const due = deadlineLabel(a.deadline);
          const skill = skillLabelOf(a);
          return (
            <div
              key={a.id}
              data-testid={`urgent-item-${a.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white p-3"
            >
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-900">
                {a.test_name || `Bài tập #${a.id.slice(0, 8)}`}
              </span>
              {skill && <Badge tone={skillToneOf(a)}>{skill}</Badge>}
              <Badge tone={due.tone}>{due.label}</Badge>
              {isOverdue(a.deadline) ? (
                <span className="text-[13px] text-ink-400">Đã hết hạn làm bài</span>
              ) : (
                <Button data-testid={`urgent-take-${a.id}`} asChild size="sm">
                  <Link href={takeHref(a)}>Làm bài</Link>
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
