"use client";

import type { Batch } from "@/features/partner/assignment-groups";
import { HW_ROW_LIFT } from "@/features/partner/assignment-class-table";
import { isDueSoon, isOverdue, shortDate } from "@/features/assignments/deadline";
import { cn } from "@/lib/utils";
import { tierLabel } from "@/features/assignments/assignment-format";

const COLUMNS = "grid-cols-[28px_2.4fr_1.3fr_1.4fr_1fr_1fr]";

const SKILL_LABEL: Record<string, string> = {
  speaking: "Speaking",
  writing: "Writing",
  reading: "Reading",
  listening: "Listening",
};

const TAG_TONE: Record<string, string> = {
  "Luyện tập": "bg-hw-blue-bg text-hw-blue",
  "BTVN (cũ)": "bg-hw-blue-bg text-hw-blue",
  "Đề thi (cũ)": "bg-hw-blue-bg text-hw-blue",
  "Full test": "bg-hw-blue-bg text-hw-blue",
  Reading: "bg-hw-purple-bg text-hw-purple",
  Listening: "bg-hw-purple-bg text-hw-purple",
  Writing: "bg-hw-amber-bg text-hw-amber",
  Speaking: "bg-hw-green-bg text-hw-green",
};


export function batchTags(batch: Batch): string[] {
  const tags: string[] = [];
  if (batch.tier) tags.push(tierLabel(batch.tier));
  if (batch.skill) tags.push(SKILL_LABEL[batch.skill] ?? batch.skill);
  return tags;
}

export function batchTitle(batch: Batch): string {
  return batch.setName || `Đề ${batch.testId.slice(0, 8)}`;
}

export function BatchTags({ batch }: { batch: Batch }) {
  return (
    <div className="flex flex-wrap gap-[5px]">
      {batchTags(batch).map((tag) => (
        <span
          key={tag}
          className={cn(
            "whitespace-nowrap rounded-md px-[7px] py-0.5 text-[10.5px] font-semibold",
            TAG_TONE[tag] ?? "bg-hw-blue-bg text-hw-blue",
          )}
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}

export function ClassAssignmentTable({
  batches,
  selectedKeys,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  batches: Batch[];
  selectedKeys: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (batch: Batch) => void;
}) {
  const allSelected = batches.length > 0 && batches.every((b) => selectedKeys.has(b.key));
  return (
    <div className="overflow-hidden rounded-[14px] border border-hw-line bg-white">
      <div
        className={cn(
          "grid gap-2.5 border-b border-hw-line bg-hw-surface px-4 py-2.5 text-[11.5px] font-semibold text-hw-ink-4",
          COLUMNS,
        )}
      >
        <input
          type="checkbox"
          aria-label="Chọn tất cả bài trên trang"
          data-testid="class-bai-select-all"
          checked={allSelected}
          onChange={(e) => onToggleAll(e.target.checked)}
          className="size-3.5 accent-hw-blue"
        />
        <div>Tên bài</div>
        <div>Loại bài</div>
        <div>Thời gian</div>
        <div>Đã làm</div>
        <div>Cần đánh giá</div>
      </div>
      {batches.map((batch) => (
        <div
          key={batch.key}
          data-testid={`class-bai-row-${batch.key}`}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(batch)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(batch);
            }
          }}
          className={cn(
            "grid cursor-pointer items-center gap-2.5 border-b border-hw-line-2 px-4 py-[11px] text-[12.5px] last:border-0",
            COLUMNS,
            HW_ROW_LIFT,
            selectedKeys.has(batch.key) && "bg-hw-blue-sel",
          )}
        >
          <input
            type="checkbox"
            aria-label={`Chọn ${batchTitle(batch)}`}
            checked={selectedKeys.has(batch.key)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggle(batch.key)}
            className="size-3.5 accent-hw-blue"
          />
          <div className="min-w-0 font-semibold text-hw-ink">{batchTitle(batch)}</div>
          <BatchTags batch={batch} />
          {/* Text format follows the design doc; the colour carries the urgency the bulk actions
              exist to fix, so an overdue run is visible without a second column. */}
          <div className="text-xs text-hw-ink-3">
            {shortDate(batch.createdAt)} –{" "}
            <span
              className={cn(
                isOverdue(batch.deadline) && "font-semibold text-hw-red",
                !isOverdue(batch.deadline) && isDueSoon(batch.deadline) && "font-semibold text-hw-amber",
              )}
            >
              {batch.deadline ? shortDate(batch.deadline) : "Không hạn"}
            </span>
          </div>
          <div className="num font-semibold text-hw-ink">
            {batch.submitted}/{batch.total}
          </div>
          <div
            className={cn("num font-bold", batch.pendingReview > 0 ? "text-hw-amber" : "text-hw-ink-6")}
          >
            {batch.pendingReview}
          </div>
        </div>
      ))}
    </div>
  );
}
