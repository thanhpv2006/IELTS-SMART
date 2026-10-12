export type SortKey = "newest" | "deadline" | "needReview" | "lowestSubmit";
export type StudentSortKey = "newest" | "deadline";

export type SortOption<K> = { key: K; label: string };

export const SORT_OPTIONS: SortOption<SortKey>[] = [
  { key: "newest", label: "Mới giao nhất" },
  { key: "deadline", label: "Hạn gần nhất" },
  { key: "needReview", label: "Cần đánh giá nhiều nhất" },
  { key: "lowestSubmit", label: "Tỉ lệ nộp thấp nhất" },
];

export const STUDENT_SORT_OPTIONS: SortOption<StudentSortKey>[] = [
  { key: "newest", label: "Mới giao nhất" },
  { key: "deadline", label: "Hạn gần nhất" },
];

export type Sortable = {
  createdAt: string;
  deadline?: string;
  pendingReview?: number;
  submitted?: number;
  total?: number;
};

const byNewest = (a: Sortable, b: Sortable) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

// An assignment with no due date sorts last rather than first, so "closest
// deadline" never surfaces work that has no deadline at all.
function byDeadline(a: Sortable, b: Sortable) {
  if (!a.deadline && !b.deadline) return byNewest(a, b);
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}

const submitRatio = (x: Sortable) => (x.total && x.total > 0 ? (x.submitted ?? 0) / x.total : 1);

export function sortComparator<T extends Sortable>(key: SortKey | StudentSortKey): (a: T, b: T) => number {
  switch (key) {
    case "deadline":
      return byDeadline;
    case "needReview":
      return (a, b) => (b.pendingReview ?? 0) - (a.pendingReview ?? 0) || byNewest(a, b);
    case "lowestSubmit":
      return (a, b) => submitRatio(a) - submitRatio(b) || byNewest(a, b);
    default:
      return byNewest;
  }
}
