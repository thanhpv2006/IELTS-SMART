"use client";

import { Folder, Plus } from "lucide-react";

import type { ClassGroup } from "@/features/partner/assignment-groups";
import { cn } from "@/lib/utils";

const COLUMNS = "grid-cols-[2fr_1fr_1fr_1.2fr_1.6fr_56px]";

// A <tr> cannot show the design's hover shadow: box-shadow is not painted on table rows under
// border-collapse, so the folder list is the prototype's own CSS grid instead of the Table primitive.
export const HW_ROW_LIFT =
  "relative transition duration-150 hover:z-1 hover:-translate-y-px hover:bg-hw-blue-row hover:shadow-[0_4px_14px_rgba(37,99,235,0.12)]";

export function ClassCompletionBar({ completion }: { completion: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-hw-line">
        <div className="h-full rounded-full bg-hw-green-bar" style={{ width: `${completion}%` }} />
      </div>
      <span className="text-[11.5px] font-bold text-hw-ink">{completion}%</span>
    </div>
  );
}

export function ClassQuickAssignButton({
  group,
  onQuickAssign,
  size = "sm",
}: {
  group: ClassGroup;
  onQuickAssign: (group: ClassGroup) => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      data-testid={`class-folder-assign-${group.key}`}
      title="Giao thêm bài tập"
      aria-label={`Giao thêm bài tập cho ${group.name}`}
      onClick={(e) => {
        e.stopPropagation();
        onQuickAssign(group);
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[7px] border border-hw-blue-border bg-white text-hw-blue hover:bg-hw-blue-sel",
        size === "sm" ? "size-[26px]" : "size-7",
      )}
    >
      <Plus className="size-3.5" />
    </button>
  );
}

export function ClassFolderIcon({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[7px] bg-hw-blue-bg text-hw-blue",
        size === "sm" ? "size-[26px]" : "size-9 rounded-[10px]",
      )}
    >
      <Folder className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}

export function AssignmentClassTable({
  groups,
  onOpen,
  onQuickAssign,
}: {
  groups: ClassGroup[];
  onOpen: (group: ClassGroup) => void;
  onQuickAssign: (group: ClassGroup) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-hw-line bg-white">
      <div
        className={cn(
          "grid gap-2.5 border-b border-hw-line bg-hw-surface px-4 py-2.5 text-[11.5px] font-semibold text-hw-ink-4",
          COLUMNS,
        )}
      >
        <div>Tên lớp</div>
        <div>Đã giao</div>
        <div>Đang mở</div>
        <div>Cần đánh giá</div>
        <div>Tỷ lệ hoàn thành</div>
        <div />
      </div>
      {groups.map((group) => (
        <div
          key={group.key}
          data-testid={`class-folder-row-${group.key}`}
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
            "grid cursor-pointer items-center gap-2.5 border-b border-hw-line-2 px-4 py-[11px] text-[12.5px] last:border-0",
            COLUMNS,
            HW_ROW_LIFT,
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <ClassFolderIcon />
            <span className="truncate font-semibold text-hw-ink">{group.name}</span>
          </div>
          <div className="num text-hw-ink-2">{group.total}</div>
          <div className="num font-semibold text-hw-green">{group.open}</div>
          <div className="num font-semibold text-hw-amber">{group.needReview}</div>
          <ClassCompletionBar completion={group.completion} />
          <div className="flex justify-end">
            {!group.isSolo && <ClassQuickAssignButton group={group} onQuickAssign={onQuickAssign} />}
          </div>
        </div>
      ))}
    </div>
  );
}
