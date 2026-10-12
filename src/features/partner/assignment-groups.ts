import type { Assignment, SmartClass } from "@/features/partner/api";

export const SUBMITTED = new Set(["submitted", "scored", "reviewed", "released"]);
export const GRADED = new Set(["reviewed", "released"]);
export const PENDING_REVIEW = new Set(["submitted", "scored"]);

/** Group key for work that belongs to no live class — assigned individually, or to a class since deleted. */
export const SOLO_GROUP = "__solo__";
export const SOLO_LABEL = "Giao lẻ";

export type Status = "open" | "closed";

export type Batch = {
  key: string;
  testId: string;
  groupKey: string;
  className: string;
  /** The frozen class id, kept so "giao lại" can target the same class. Absent for solo work. */
  classId?: string;
  /** Kept so "giao lại" re-issues the same time limit. Absent when the batch is untimed. */
  timeLimitMinutes?: number;
  // Timestamp shared by all rows of one "Giao bài tập" action — distinguishes
  // re-assignments of the same test to the same class as separate batches.
  createdAt: string;
  setName?: string;
  skill?: string;
  tier?: string;
  deadline?: string;
  total: number;
  submitted: number;
  graded: number;
  pendingReview: number;
  status: Status;
  /** Every assignment row of the batch — the unit the bulk deadline endpoint operates on. */
  assignmentIds: string[];
  /** Rows with nothing handed in: what "thu hồi" deletes and "giao lại" re-assigns. */
  pendingIds: string[];
  pendingStudentIds: string[];
};

const isObjectiveSkill = (skill?: string) => skill === "reading" || skill === "listening";

/**
 * The folder an assignment row belongs to. A row whose frozen `class_id` is absent from
 * `knownClassIds` belongs to no live class — which covers both work assigned individually and work
 * frozen to a class that has since been deleted.
 */
export function assignmentGroupKey(a: Assignment, knownClassIds: Set<string>): string {
  return a.class_id && knownClassIds.has(a.class_id) ? a.class_id : SOLO_GROUP;
}

/** Folds the flat per-student assignment rows into one batch per (set × class × assignment run). */
export function toBatches(assignments: Assignment[], knownClassIds: Set<string>): Batch[] {
  const byKey = new Map<string, Batch>();

  for (const a of assignments) {
    const groupKey = assignmentGroupKey(a, knownClassIds);
    const className = groupKey === SOLO_GROUP ? SOLO_LABEL : a.class_name ?? SOLO_LABEL;
    const key = `${a.test_id}::${groupKey}::${a.created_at}`;

    let batch = byKey.get(key);
    if (!batch) {
      batch = {
        key,
        testId: a.test_id,
        groupKey,
        className,
        classId: groupKey === SOLO_GROUP ? undefined : a.class_id,
        timeLimitMinutes: a.time_limit_minutes,
        createdAt: a.created_at,
        setName: a.test_name,
        skill: a.skill,
        tier: a.tier,
        deadline: a.deadline,
        total: 0,
        submitted: 0,
        graded: 0,
        pendingReview: 0,
        status: "open",
        assignmentIds: [],
        pendingIds: [],
        pendingStudentIds: [],
      };
      byKey.set(key, batch);
    }

    batch.total++;
    batch.assignmentIds.push(a.id);
    if (!SUBMITTED.has(a.status)) {
      batch.pendingIds.push(a.id);
      batch.pendingStudentIds.push(a.student_id);
    }
    if (SUBMITTED.has(a.status)) batch.submitted++;
    // Reading/Listening are graded deterministically and auto-released to the student, so the
    // teacher never "đánh giá" them — count any submission as already graded.
    if (isObjectiveSkill(a.skill)) {
      if (SUBMITTED.has(a.status)) batch.graded++;
    } else {
      if (GRADED.has(a.status)) batch.graded++;
      if (PENDING_REVIEW.has(a.status)) batch.pendingReview++;
    }
    if (a.deadline && (!batch.deadline || a.deadline < batch.deadline)) batch.deadline = a.deadline;
  }

  const now = Date.now();
  for (const batch of byKey.values()) {
    batch.status = batch.deadline && now > new Date(batch.deadline).getTime() ? "closed" : "open";
  }

  // BE returns created_at DESC and a Map preserves insertion order, so the newest batch is first.
  return [...byKey.values()];
}

const DUE_SOON_DAYS = 3;

/** Reports whether the batch is still open and its deadline falls within the next 3 days. */
export function isDueSoon(batch: Batch): boolean {
  if (batch.status !== "open" || !batch.deadline) return false;
  const ms = new Date(batch.deadline).getTime() - Date.now();
  return ms >= 0 && ms <= DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
}

export type StatusFilterKey = "all" | "open" | "needReview" | "dueSoon" | "closed";

export const STATUS_FILTERS: {
  key: StatusFilterKey;
  label: string;
  tone: string;
  match: (batch: Batch) => boolean;
}[] = [
  { key: "all", label: "Tất cả", tone: "text-hw-ink", match: () => true },
  { key: "open", label: "Số bài đang mở", tone: "text-hw-green", match: (b) => b.status === "open" },
  { key: "needReview", label: "Số bài cần đánh giá", tone: "text-hw-amber", match: (b) => b.pendingReview > 0 },
  { key: "dueSoon", label: "Số bài sắp hết hạn", tone: "text-hw-red", match: isDueSoon },
  { key: "closed", label: "Số bài đã kết thúc", tone: "text-hw-ink-6", match: (b) => b.status === "closed" },
];

/** The stat-card label for the whole-page total, which has no filter equivalent of its own. */
export const TOTAL_LABEL = "Tổng số bài đã giao";

export type ClassGroup = {
  key: string;
  name: string;
  isSolo: boolean;
  classId?: string;
  total: number;
  open: number;
  needReview: number;
  completion: number;
  batches: Batch[];
};

function groupOf(key: string, name: string, batches: Batch[], classId?: string): ClassGroup {
  const submitRate = (b: Batch) => (b.total > 0 ? (b.submitted / b.total) * 100 : 0);
  return {
    key,
    name,
    isSolo: key === SOLO_GROUP,
    classId,
    // Counted in assignment runs, not student rows — which is also why
    // SmartClass.assignment_count (a COUNT over assignment rows) cannot be used here.
    total: batches.length,
    open: batches.filter((b) => b.status === "open").length,
    needReview: batches.filter((b) => b.pendingReview > 0).length,
    // Mean of each run's submission rate, so a skipped run in a big class is not diluted
    // by a finished one in a small class.
    completion: batches.length
      ? Math.round(batches.reduce((sum, b) => sum + submitRate(b), 0) / batches.length)
      : 0,
    batches,
  };
}

/** One group per class in the class list's order, plus `Giao lẻ` last when any batch feeds it. */
export function toClassGroups(batches: Batch[], classes: SmartClass[]): ClassGroup[] {
  const byGroup = new Map<string, Batch[]>();
  for (const batch of batches) {
    const list = byGroup.get(batch.groupKey);
    if (list) list.push(batch);
    else byGroup.set(batch.groupKey, [batch]);
  }

  const groups = classes.map((c) => groupOf(c.id, c.name, byGroup.get(c.id) ?? [], c.id));
  const solo = byGroup.get(SOLO_GROUP);
  if (solo?.length) groups.push(groupOf(SOLO_GROUP, SOLO_LABEL, solo));
  return groups;
}
