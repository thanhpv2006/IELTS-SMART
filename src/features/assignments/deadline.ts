import type { BadgeProps } from "@/components/ui/badge";

type Tone = NonNullable<BadgeProps["tone"]>;
export type DeadlineBadge = { label: string; tone: Tone };

const DAY_MS = 86_400_000;
const URGENT_DAYS = 2;

export function deadlineBadge(deadline?: string): DeadlineBadge | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms < 0) return { label: "Quá hạn", tone: "error" };
  const days = Math.ceil(ms / DAY_MS);
  if (days <= URGENT_DAYS) return { label: days <= 1 ? "Còn 1 ngày" : `Còn ${days} ngày`, tone: "warning" };
  return { label: `Hạn ${new Date(deadline).toLocaleDateString("vi-VN")}`, tone: "gray" };
}

/** Always renderable, for table cells and rows that must never be blank. */
export const deadlineLabel = (deadline?: string): DeadlineBadge =>
  deadlineBadge(deadline) ?? { label: "Không hạn", tone: "gray" };

export const isOverdue = (deadline?: string): boolean =>
  !!deadline && new Date(deadline).getTime() < Date.now();

export function isDueSoon(deadline?: string, days = 3): boolean {
  if (!deadline) return false;
  const ms = new Date(deadline).getTime() - Date.now();
  return ms >= 0 && ms <= days * DAY_MS;
}

export const shortDate = (v?: string) => (v ? new Date(v).toLocaleDateString("vi-VN") : "");
