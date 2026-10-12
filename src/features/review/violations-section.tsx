import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssignmentResult } from "@/features/partner/api";

// Vietnamese labels for each violation recorded during the exam (exam mode).
const VIOLATION_LABEL: Record<string, string> = {
  "leave-tab": "Rời tab",
  blur: "Mất tập trung",
  "paste-blocked": "Chặn dán",
  copy: "Sao chép",
  "exit-fullscreen": "Thoát toàn màn hình",
};

// Shown only when there is at least one violation — the log is a deterrent and never blocks submission.
export function ViolationsSection({ violations }: { violations?: AssignmentResult["violations"] }) {
  if (!violations || violations.total <= 0) return null;
  const entries = Object.entries(violations.by_type).filter(([, count]) => count > 0);

  return (
    <div data-testid="violations-section" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4.5 shrink-0 text-amber-600" />
        <h2 className="text-sm font-bold text-amber-800">
          Vi phạm khi làm bài <span className="font-semibold">({violations.total})</span>
        </h2>
      </div>
      {entries.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {entries.map(([type, count]) => (
            <Badge key={type} tone="warning">
              {VIOLATION_LABEL[type] ?? type}: {count}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
