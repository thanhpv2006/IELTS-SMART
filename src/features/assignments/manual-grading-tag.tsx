import { AlertTriangle } from "lucide-react";
import { MANUAL_GRADING_LABEL } from "@/features/assignments/assignment-format";

/** Marks a result graded by a teacher because AI credit ran out (centre pool or student cap);
 *  stays after release. */
export function ManualGradingTag() {
  return (
    <span
      title="Lúc học viên nộp bài, lượt chấm AI đã hết — giáo viên chấm tay trước khi chốt."
      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
    >
      <AlertTriangle className="size-3.5 shrink-0" /> {MANUAL_GRADING_LABEL}
    </span>
  );
}
