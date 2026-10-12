"use client";

import { cn } from "@/lib/utils";

export type StatFilter<T> = {
  key: string;
  label: string;
  color: string;
  match: (item: T) => boolean;
};

/**
 * Counts are taken from `items` exactly as given — pass the set already narrowed
 * by the page's other filters, or the chips will contradict the list below them.
 */
export function AssignmentStatChips<T>({
  items,
  filters,
  active,
  onChange,
}: {
  items: T[];
  filters: StatFilter<T>[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {filters.map((f) => {
        const count = items.filter(f.match).length;
        const isActive = active === f.key;
        return (
          <button
            key={f.key}
            type="button"
            data-testid={`filter-stat-${f.key}`}
            onClick={() => onChange(f.key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50",
            )}
          >
            {f.label}
            <span className={cn("num text-[13px] font-bold", isActive ? "text-brand-700" : f.color)}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
