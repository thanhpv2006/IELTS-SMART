"use client";

import type { ReactNode } from "react";
import { LayoutGrid, List, RotateCcw } from "lucide-react";

import { HoverDropdown } from "@/components/ui/hover-dropdown";
import { SearchBar } from "@/components/ui/search-pagination";
import { cn } from "@/lib/utils";
import type { SortOption } from "@/features/assignments/assignment-sort";
import type { ViewMode } from "@/features/assignments/use-view-mode";

export function AssignmentToolbar<K extends string>({
  query,
  onQueryChange,
  searchPlaceholder = "Tìm kiếm...",
  filters,
  sort,
  sortOptions,
  onSortChange,
  view,
  onViewChange,
  resultCount,
  onReset,
  showReset,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  sort: K;
  sortOptions: SortOption<K>[];
  onSortChange: (key: K) => void;
  view: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  resultCount: number;
  onReset: () => void;
  showReset: boolean;
}) {
  const sortLabel = sortOptions.find((o) => o.key === sort)?.label ?? sortOptions[0].label;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <SearchBar
        value={query}
        onChange={onQueryChange}
        placeholder={searchPlaceholder}
        className="w-full sm:w-64"
      />

      {filters}

      <div className="flex items-center gap-1.5">
        <span className="text-sm text-ink-500">Sắp xếp:</span>
        <HoverDropdown label={sortLabel} active={sort !== sortOptions[0].key}>
          {(close) => (
            <>
              {sortOptions.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    onSortChange(o.key);
                    close();
                  }}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-ink-50",
                    o.key === sort && "bg-brand-50 font-medium text-brand-600",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </>
          )}
        </HoverDropdown>
      </div>

      {showReset && (
        <button
          type="button"
          data-testid="reset-filters"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:text-brand-700"
        >
          <RotateCcw className="size-3.5" /> Xóa lọc
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[13px] text-ink-500">
          Hiển thị <strong className="num text-ink-700">{resultCount}</strong> bài
        </span>
        <div className="inline-flex items-center gap-1 rounded-full bg-ink-100 p-1">
          <button
            type="button"
            data-testid="view-grid"
            onClick={() => onViewChange("grid")}
            title="Dạng lưới"
            aria-label="Dạng lưới"
            className={cn(
              "rounded-full p-1.5 transition-all",
              view === "grid" ? "bg-white text-brand-600 shadow-sm" : "text-ink-400 hover:text-ink-600",
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            data-testid="view-list"
            onClick={() => onViewChange("list")}
            title="Dạng bảng"
            aria-label="Dạng bảng"
            className={cn(
              "rounded-full p-1.5 transition-all",
              view === "list" ? "bg-white text-brand-600 shadow-sm" : "text-ink-400 hover:text-ink-600",
            )}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
