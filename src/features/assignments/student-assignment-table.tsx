"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StudentAssignment, StudentResult } from "@/features/student/api";
import { takeHref } from "@/features/student/take-href";
import { deadlineLabel, isOverdue, shortDate } from "@/features/assignments/deadline";
import { resultScoreLabel } from "@/features/results/score-label";
import {
  skillLabelOf,
  skillToneOf,
  studentStatusLabelOf,
  tierLabel,
} from "@/features/assignments/assignment-format";

export function StudentAssignmentTable({
  items,
  resultByAssignment,
  onOpenResult,
}: {
  items: StudentAssignment[];
  resultByAssignment: Record<string, StudentResult>;
  onOpenResult: (resultId: string) => void;
}) {
  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-ink-50">
            <TableHead className="uppercase text-ink-400">Đề</TableHead>
            <TableHead className="hidden uppercase text-ink-400 lg:table-cell">Kỹ năng</TableHead>
            <TableHead className="hidden uppercase text-ink-400 lg:table-cell">Giao</TableHead>
            <TableHead className="uppercase text-ink-400">Hạn nộp</TableHead>
            <TableHead className="uppercase text-ink-400">Trạng thái</TableHead>
            <TableHead className="uppercase text-ink-400">Kết quả</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a) => {
            const result = resultByAssignment[a.id];
            const hasResult = a.status === "released";
            const score = hasResult && result ? resultScoreLabel(result.result, result.band) : null;
            const overdue = isOverdue(a.deadline);
            const canTake = a.status === "pending" && !overdue;
            const due = deadlineLabel(a.deadline);
            const skill = skillLabelOf(a);
            const studentStatus = studentStatusLabelOf(a);
            return (
              <TableRow key={a.id} data-testid={`assignment-row-${a.id}`}>
                <TableCell>
                  <div className="font-semibold text-ink-900">
                    {a.test_name || `Bài tập #${a.id.slice(0, 8)}`}
                  </div>
                  {a.time_limit_minutes != null && (
                    <div className="mt-0.5 text-xs text-ink-400">{a.time_limit_minutes} phút</div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {skill && <Badge tone={skillToneOf(a)}>{skill}</Badge>}
                  {a.purpose !== "mock" && a.tier && (
                    <span className="ml-1.5 text-xs text-ink-400">{tierLabel(a.tier)}</span>
                  )}
                </TableCell>
                <TableCell className="hidden text-ink-600 lg:table-cell">{shortDate(a.created_at)}</TableCell>
                <TableCell>
                  <Badge data-testid={`deadline-badge-${a.id}`} tone={due.tone}>
                    {due.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge tone={studentStatus.tone} className="whitespace-normal leading-snug">{studentStatus.label}</Badge>
                </TableCell>
                <TableCell>
                  {score ? (
                    <span className="num font-bold text-success-700">{score}</span>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {canTake && (
                      <Button data-testid={`take-btn-${a.id}`} asChild size="sm">
                        <Link href={takeHref(a)}>Làm bài</Link>
                      </Button>
                    )}
                    {a.status === "pending" && overdue && (
                      <Badge tone="error">Quá hạn</Badge>
                    )}
                    {hasResult && result && (
                      <Button
                        data-testid={`view-result-btn-${a.id}`}
                        variant="soft"
                        size="sm"
                        onClick={() => onOpenResult(result.id)}
                      >
                        Xem kết quả
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
