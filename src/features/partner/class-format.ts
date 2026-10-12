import type { ClassStatus, SmartClass } from "@/features/partner/api";

// Shared display helpers for class cards / class detail screen.

export function studentLabel(item: SmartClass) {
  return item.capacity ? `${item.student_count}/${item.capacity} học viên` : `${item.student_count} học viên`;
}

export function classDateRange(item: SmartClass) {
  if (!item.start_date && !item.end_date) return "Chưa đặt lịch";
  return `${formatDate(item.start_date)} – ${formatDate(item.end_date)}`;
}

export function formatDate(value?: string) {
  if (!value) return "--/--/----";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/** dd/MM from an ISO timestamp (assignment date / deadline). */
export function shortDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function progressClass(percent: number) {
  if (percent >= 80) return "bg-emerald-500";
  if (percent >= 60) return "bg-amber-400";
  return "bg-brand-500";
}

export function levelBadgeClass(level?: string) {
  if (!level) return "border-ink-200 bg-ink-50 text-ink-500";
  if (level.includes("7")) return "border-violet-200 bg-violet-50 text-violet-600";
  if (level.includes("5.5")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (level.toLowerCase().includes("giao")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (level.toLowerCase().includes("foundation")) return "border-ink-200 bg-ink-50 text-ink-600";
  return "border-sky-200 bg-sky-50 text-brand-600";
}

export const CLASS_STATUS_OPTIONS = [
  { value: "active" as const, label: "Đang học" },
  { value: "completed" as const, label: "Đã kết thúc" },
  { value: "paused" as const, label: "Tạm dừng" },
] as const satisfies ReadonlyArray<{ value: ClassStatus; label: string }>;

export function statusLabel(s: ClassStatus): string {
  const option = CLASS_STATUS_OPTIONS.find((opt) => opt.value === s);
  return option?.label ?? s;
}

export function statusBadgeClass(s: ClassStatus): string {
  switch (s) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "completed":
      return "border-red-200 bg-red-50 text-red-700";
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-ink-200 bg-ink-50 text-ink-600";
  }
}
