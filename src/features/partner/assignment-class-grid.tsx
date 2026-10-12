"use client";

import type { ClassGroup } from "@/features/partner/assignment-groups";
import {
  ClassCompletionBar,
  ClassFolderIcon,
  ClassQuickAssignButton,
  HW_ROW_LIFT,
} from "@/features/partner/assignment-class-table";
import { cn } from "@/lib/utils";

export function AssignmentClassGrid({
  groups,
  onOpen,
  onQuickAssign,
}: {
  groups: ClassGroup[];
  onOpen: (group: ClassGroup) => void;
  onQuickAssign: (group: ClassGroup) => void;
}) {
  return (
    <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div
          key={group.key}
          data-testid={`class-folder-card-${group.key}`}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(group)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(group);
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col gap-[11px] rounded-[14px] border border-hw-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]",
            HW_ROW_LIFT,
          )}
        >
          <div className="flex items-center gap-2.5">
            <ClassFolderIcon size="md" />
            <div className="min-w-0 flex-1 truncate text-sm font-bold text-hw-ink">{group.name}</div>
            {!group.isSolo && (
              <ClassQuickAssignButton group={group} onQuickAssign={onQuickAssign} size="md" />
            )}
          </div>
          <div className="flex flex-wrap gap-3.5 text-[11.5px] text-hw-ink-3">
            <span>
              <b className="num text-hw-ink">{group.total}</b> đã giao
            </span>
            <span>
              <b className="num text-hw-green">{group.open}</b> đang mở
            </span>
            <span>
              <b className="num text-hw-amber">{group.needReview}</b> cần đánh giá
            </span>
          </div>
          <div>
            <div className="mb-1 text-[11.5px] text-hw-ink-3">Tỷ lệ hoàn thành</div>
            <ClassCompletionBar completion={group.completion} />
          </div>
        </div>
      ))}
    </div>
  );
}
