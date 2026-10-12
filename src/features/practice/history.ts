import { isObjectiveResult } from "@/features/take/objective-result-view";

export type PracticeHistoryEntry = {
  attempts: number;
  bestCorrect?: { raw: number; total: number };
  lastResultId?: string;
};

type SelfPracticeAssignment = {
  id: string;
  test_id: string;
  origin: string;
  created_at: string;
};

type PracticeResult = {
  id: string;
  assignment_id?: string;
  result?: unknown;
};

export function buildPracticeHistory(
  assignments: SelfPracticeAssignment[],
  results: PracticeResult[],
): Record<string, PracticeHistoryEntry> {
  const resultByAssignmentId = new Map<string, PracticeResult>();
  for (const result of results) {
    if (result.assignment_id) {
      resultByAssignmentId.set(result.assignment_id, result);
    }
  }

  const history: Record<string, PracticeHistoryEntry> = {};
  const lastAttemptedAt = new Map<string, number>();

  for (const assignment of assignments) {
    if (assignment.origin !== "self_practice") continue;

    const entry = history[assignment.test_id] ?? { attempts: 0 };
    entry.attempts += 1;
    history[assignment.test_id] = entry;

    const result = resultByAssignmentId.get(assignment.id);
    if (!result) continue;

    const graded = result.result;
    if (isObjectiveResult(graded) && (entry.bestCorrect === undefined || graded.raw > entry.bestCorrect.raw)) {
      entry.bestCorrect = { raw: graded.raw, total: graded.total };
    }

    const attemptedAt = new Date(assignment.created_at).getTime();
    const latest = lastAttemptedAt.get(assignment.test_id);
    if (latest === undefined || attemptedAt > latest) {
      lastAttemptedAt.set(assignment.test_id, attemptedAt);
      entry.lastResultId = result.id;
    }
  }

  return history;
}
