"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Plus } from "lucide-react";

import { assignmentApi, classApi } from "@/features/partner/api";
import { catalogApi } from "@/features/catalog/api";
import { SET_KIND_LABELS, normalizeKind } from "@/features/catalog/types";
import type { CatalogQuestionSet } from "@/features/catalog/types";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { HoverDropdown } from "@/components/ui/hover-dropdown";
import { SearchBar } from "@/components/ui/search-pagination";

type SortKey = "az" | "new" | "old";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "Sắp xếp theo thứ tự" },
  { key: "new", label: "Sắp xếp theo đề mới → cũ" },
  { key: "old", label: "Sắp xếp theo đề cũ → mới" },
];

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

function setTags(set: CatalogQuestionSet): string[] {
  const tags = [SET_KIND_LABELS[normalizeKind(set.kind)]];
  if (set.skill) tags.push(SKILL_LABEL[set.skill] ?? set.skill);
  return tags;
}

// question_sets.duration_minutes has no CHECK constraint; an out-of-range value would make the
// backend reject the whole assign, so only forward it when it is within 1-240.
function quickTimeLimit(set: CatalogQuestionSet | undefined): number | undefined {
  const minutes = set?.duration_minutes;
  if (set?.skill === "speaking" || minutes === undefined) return undefined;
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 240 ? minutes : undefined;
}

export function QuickAssignDialog({
  classId,
  className,
  onClose,
}: {
  classId: string;
  className: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("new");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  // Counts only what this dialog session assigned, so the teacher can tell what they just clicked
  // apart from the historical total beside it.
  const [justAssigned, setJustAssigned] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  // full_test is excluded here for the same reason as in AssignDialog: it ships through
  // mockApi.assignMock, a different pipeline.
  const { data: catalogSets = [], isLoading } = useQuery({
    queryKey: ["catalog-sets", "published"],
    queryFn: () => catalogApi.listSets({ status: "published" }),
  });
  const sets = useMemo(() => catalogSets.filter((s) => s.kind !== "full_test"), [catalogSets]);

  // Read once per open and held for the session: folding the server's new total back in mid-session
  // would double-count what the teacher just clicked, which already shows as the "+n" beside it.
  // Reopening the dialog is what refreshes the figure.
  const { data: counts = {} } = useQuery({
    queryKey: ["assignment-counts"],
    queryFn: assignmentApi.assignmentCounts,
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  const { data: classDetail } = useQuery({
    queryKey: ["classes", classId],
    queryFn: () => classApi.get(classId),
  });
  const roster = useMemo(() => (classDetail?.students ?? []).map((s) => s.user_id), [classDetail]);

  const assign = useMutation({
    mutationFn: async (setIds: string[]) => {
      for (const setId of setIds) {
        const time_limit_minutes = quickTimeLimit(sets.find((s) => s.id === setId));
        await assignmentApi.assign(setId, { student_ids: roster, class_id: classId, time_limit_minutes });
      }
      return setIds;
    },
    onSuccess: (setIds) => {
      setError(null);
      setJustAssigned((prev) => {
        const next = { ...prev };
        for (const setId of setIds) next[setId] = (next[setId] ?? 0) + 1;
        return next;
      });
      setTicked({});
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? sets.filter((s) => s.title.toLowerCase().includes(q)) : [...sets];
    if (sort === "az") matched.sort((a, b) => a.title.localeCompare(b.title, "vi"));
    else if (sort === "old") matched.reverse();
    return matched;
  }, [sets, query, sort]);

  const tickedIds = Object.keys(ticked).filter((id) => ticked[id]);
  const rosterEmpty = !!classDetail && roster.length === 0;
  const busy = assign.isPending;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Giao bài tập"
      size="lg"
      hideHeader
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex items-baseline gap-2 px-5 pb-2.5 pt-[18px] pr-12">
          <span className="whitespace-nowrap text-[15px] font-bold text-hw-ink">Giao bài tập</span>
          <span className="truncate text-[12.5px] font-semibold text-hw-blue">· {className}</span>
        </div>

        <div className="flex items-center gap-2 px-5 pb-2.5">
          <SearchBar value={query} onChange={setQuery} placeholder="Tìm bài tập..." className="flex-1" />
          <HoverDropdown
            align="right"
            label={<ArrowDownUp className="size-3.5" />}
            triggerClassName="border-hw-line-3 bg-white text-hw-ink-2 hover:text-hw-blue [&>svg:last-child]:hidden size-[34px] justify-center"
          >
            {(close) => (
              <div data-testid="quick-assign-sort-menu">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setSort(option.key);
                      close();
                    }}
                    className={cn(
                      "block w-full whitespace-nowrap rounded-[7px] px-2.5 py-2 text-left text-[12.5px] hover:bg-hw-blue-sel",
                      sort === option.key ? "bg-hw-blue-sel font-bold text-hw-blue" : "text-hw-ink-2",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </HoverDropdown>
          {tickedIds.length > 0 && (
            <button
              type="button"
              data-testid="quick-assign-bulk"
              disabled={busy || rosterEmpty}
              onClick={() => assign.mutate(tickedIds)}
              className="whitespace-nowrap rounded-[7px] bg-hw-blue px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-hw-blue-hover disabled:opacity-50"
            >
              Giao bài ({tickedIds.length})
            </button>
          )}
        </div>

        {error && <p className="px-5 pb-2 text-[12.5px] text-hw-red">{error}</p>}
        {rosterEmpty && (
          <p className="px-5 pb-2 text-[12.5px] text-hw-amber">
            Lớp này chưa có học viên nào, chưa giao bài được.
          </p>
        )}

        <div className="flex items-center gap-4 border-t border-hw-line bg-hw-surface px-5 py-2 text-[10.5px] font-bold uppercase tracking-[0.4px] text-hw-ink-4">
          <span className="w-3.5" />
          <span className="flex-1">Tên bài</span>
          <span className="w-[150px] text-right">Loại bài</span>
          <span className="min-w-11 text-center" title="Số lượt đã giao">
            Đã giao
          </span>
          <span className="w-[26px]" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-hw-line">
          {isLoading ? (
            <p className="py-8 text-center text-[12.5px] text-hw-ink-5">Đang tải bài tập…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-[12.5px] text-hw-ink-5">Không có bài tập khớp tìm kiếm.</p>
          ) : (
            rows.map((set) => {
              const extra = justAssigned[set.id] ?? 0;
              const given = counts[set.id] ?? 0;
              const minutes = quickTimeLimit(set);
              return (
                <div
                  key={set.id}
                  data-testid={`quick-assign-row-${set.id}`}
                  className={cn(
                    "flex items-center gap-4 border-b border-hw-line-2 px-5 py-2.5 text-[12.5px] last:border-0",
                    ticked[set.id] && "bg-hw-blue-sel",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Chọn ${set.title}`}
                    checked={!!ticked[set.id]}
                    onChange={() => setTicked((prev) => ({ ...prev, [set.id]: !prev[set.id] }))}
                    className="size-3.5 accent-hw-blue"
                  />
                  <div className="min-w-0 flex-1 text-hw-ink">{set.title}</div>
                  <div className="flex w-[150px] flex-wrap justify-end gap-1">
                    {setTags(set).map((tag) => (
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
                  <span className="w-12 whitespace-nowrap text-right text-[11px] text-hw-ink-6">
                    {minutes ? `${minutes} phút` : ""}
                  </span>
                  <span className="num flex min-w-11 items-center justify-center gap-[3px] text-[11px] font-bold">
                    <span className={given > 0 ? "text-hw-ink" : "text-hw-ink-6"}>{given}</span>
                    {extra > 0 && (
                      <span data-testid={`quick-assign-extra-${set.id}`} className="text-hw-green">
                        +{extra}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid={`quick-assign-add-${set.id}`}
                    title="Giao bài"
                    aria-label={`Giao ${set.title}`}
                    disabled={busy || rosterEmpty}
                    onClick={() => assign.mutate([set.id])}
                    className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-hw-blue-border bg-white text-hw-blue hover:bg-hw-blue-sel disabled:opacity-50"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
