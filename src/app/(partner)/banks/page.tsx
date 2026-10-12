"use client";

// Question bank — a unified list. New sets are always practice (one skill, one Part);
// legacy homework/exam sets stay listed under "Tất cả loại đề" but are not a filter option.
// 2 source tabs: "Của tôi" (sets the partner created or cloned, filtered by kind/skill/status)
// and "Thư viện" (Ielts Smart platform content, cloned into the bank before being assigned).
// There is no Excel import.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, BookOpen } from "lucide-react";
import { catalogApi } from "@/features/catalog/api";
import { CreateSetDialog } from "@/features/catalog/create-set-dialog";
import { ImportMenu } from "@/features/catalog/import-button";
import type { CatalogQuestionSet, CatalogSetKind, CatalogSkill, CatalogStatus } from "@/features/catalog/types";
import { FULL_TEST_ENABLED, SET_KIND_LABELS, SKILL_LABELS } from "@/features/catalog/types";
import {
  banksListHref,
  parseBanksListQuery,
  rememberBanksListHref,
  type BanksListQuery,
} from "@/features/catalog/banks-list-query";
import { BankSetCard } from "@/features/catalog/bank-set-card";
import { SetBulkActionBar } from "@/features/catalog/set-bulk-action-bar";
import { SetDeleteConfirm } from "@/features/catalog/set-delete-confirm";
import { useSetLifecycle, type SetLifecycleAction } from "@/features/catalog/use-set-lifecycle";
import { LibraryPanel } from "@/features/partner/library-panel";
import { AssignDialog } from "@/features/partner/assign-dialog";
import { assignmentApi } from "@/features/partner/api";
import { useFeatureFlag } from "@/features/partner/use-feature-flag";
import { errorMessage } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/search-pagination";
import { MockAssignDialog } from "@/features/partner/mock-assign-dialog";

const SETS_PAGE_SIZE = 12;

const inputCls =
  "rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const STATUS_LABELS: Record<CatalogStatus, string> = {
  draft: "Nháp",
  published: "Đã xuất bản",
  archived: "Đã lưu trữ",
};

export default function BanksPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const { enabled: aiImportEnabled } = useFeatureFlag("ai_import", {
    enabled: role === "partner_owner",
  });

  const searchParams = useSearchParams();
  const query = parseBanksListQuery(searchParams);
  const listHref = banksListHref(query);
  const updateQuery = (patch: Partial<BanksListQuery>) =>
    router.replace(banksListHref({ ...query, ...patch }), { scroll: false });
  useEffect(() => rememberBanksListHref(listHref), [listHref]);

  const [createOpen, setCreateOpen] = useState(false);
  const [assignSetId, setAssignSetId] = useState<string | null>(null);
  const [assignSkillSetId, setAssignSkillSetId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Ngân hàng đề</h1>
          <p className="mt-1 text-sm text-ink-500">
            Bộ đề luyện tập theo từng Part — đề trung tâm tự tạo hoặc lấy từ thư viện hệ thống.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* AI import is owner only: one run costs ~10 paid LLM calls, so the spend is the
              centre owner's call, and the backend rejects the route for a teacher anyway. Gated
              by the `ai_import` flag on top of that, so the feature ships dark until a centre is
              opted in. */}
          <ImportMenu
            showJSON={role === "partner_owner"}
            showAI={role === "partner_owner" && aiImportEnabled}
          />
          <Button data-testid="create-set-btn" onClick={() => setCreateOpen(true)}>
            <Plus /> Tạo đề
          </Button>
        </div>
      </div>

      {/* Source tab */}
      <div className="flex items-center gap-1 border-b border-ink-200">
        {([
          { key: "mine", label: "Của tôi" },
          { key: "library", label: "Thư viện" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() =>
              router.replace(banksListHref({ tab: t.key, kind: "", skill: "", status: "", page: 1 }), { scroll: false })
            }
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              query.tab === t.key
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-ink-500 hover:text-ink-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {query.tab === "mine" ? (
        <MineTab
          query={query}
          onQueryChange={updateQuery}
          onOpenCard={(id) => router.push(`/banks/${id}`)}
          onEditCard={(id) => router.push(`/banks/${id}?edit=1`)}
          onAssignSet={(s) => (s.kind === "full_test" ? setAssignSetId(s.id) : setAssignSkillSetId(s.id))}
        />
      ) : (
        <LibraryPanel />
      )}

      <CreateSetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(setId) => {
          setCreateOpen(false);
          router.push(`/banks/${setId}`);
        }}
      />

      {assignSetId && <MockAssignDialog setId={assignSetId} onClose={() => setAssignSetId(null)} />}
      {assignSkillSetId && <AssignDialog preselectedSetId={assignSkillSetId} onClose={() => setAssignSkillSetId(null)} />}
    </div>
  );
}

// ── Tab "Của tôi" ─────────────────────────────────────────────────────────────

function MineTab({
  query,
  onQueryChange,
  onOpenCard,
  onEditCard,
  onAssignSet,
}: {
  query: BanksListQuery;
  onQueryChange: (patch: Partial<BanksListQuery>) => void;
  onOpenCard: (id: string) => void;
  onEditCard: (id: string) => void;
  onAssignSet: (s: CatalogQuestionSet) => void;
}) {
  const { kind, skill, status, page } = query;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const lifecycle = useSetLifecycle();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["catalog-sets", { kind, skill, status, page }],
    queryFn: () =>
      catalogApi.listSetsPage({
        kind: kind || undefined,
        skill: skill || undefined,
        status: status || undefined,
        limit: SETS_PAGE_SIZE,
        offset: (page - 1) * SETS_PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const rawSets = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / SETS_PAGE_SIZE));

  const { data: counts = {} } = useQuery({
    queryKey: ["assignment-counts"],
    queryFn: assignmentApi.assignmentCounts,
  });

  // Hide existing full_test sets from the list while the Full test feature is off.
  const sets = FULL_TEST_ENABLED ? rawSets : rawSets.filter((s) => s.kind !== "full_test");
  const selectableOnPage = sets.filter((s) => s.can_manage);
  const allPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((s) => selectedIds.has(s.id));

  const changeFilter = (patch: Pick<Partial<BanksListQuery>, "kind" | "skill" | "status">) => {
    onQueryChange({ ...patch, page: 1 });
    setSelectedIds(new Set());
  };

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of selectableOnPage) {
        if (allPageSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const runAction = async (action: SetLifecycleAction, ids: string[]) => {
    const { succeeded } = await lifecycle.run(action, ids);
    // Every action moves the set out of the current view, so emptying the last page must step back.
    const lastPage = Math.max(1, Math.ceil(Math.max(0, (data?.total ?? 0) - succeeded.length) / SETS_PAGE_SIZE));
    if (page > lastPage) onQueryChange({ page: lastPage });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of succeeded) next.delete(id);
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await runAction("delete", pendingDelete);
    setPendingDelete(null);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          data-testid="filter-kind"
          value={kind}
          onChange={(e) => changeFilter({ kind: e.target.value as "" | CatalogSetKind })}
          className={inputCls}
        >
          <option value="">Tất cả loại đề</option>
          <option value="practice">{SET_KIND_LABELS.practice}</option>
          {FULL_TEST_ENABLED && <option value="full_test">{SET_KIND_LABELS.full_test}</option>}
        </select>

        {kind !== "full_test" && (
          <select
            data-testid="filter-skill"
            value={skill}
            onChange={(e) => changeFilter({ skill: e.target.value as "" | CatalogSkill })}
            className={inputCls}
          >
            <option value="">Tất cả kỹ năng</option>
            <option value="speaking">{SKILL_LABELS.speaking}</option>
            <option value="writing">{SKILL_LABELS.writing}</option>
            <option value="reading">{SKILL_LABELS.reading}</option>
            <option value="listening">{SKILL_LABELS.listening}</option>
          </select>
        )}

        <select
          data-testid="filter-status"
          value={status}
          onChange={(e) => changeFilter({ status: e.target.value as "" | CatalogStatus })}
          className={inputCls}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="draft">{STATUS_LABELS.draft}</option>
          <option value="published">{STATUS_LABELS.published}</option>
          <option value="archived">{STATUS_LABELS.archived}</option>
        </select>

        {selectableOnPage.length > 0 && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              data-testid="bank-select-page"
              checked={allPageSelected}
              onChange={togglePage}
              className="size-4 cursor-pointer accent-brand-600"
            />
            Chọn tất cả trang này
          </label>
        )}
      </div>

      {lifecycle.message && (
        <p
          data-testid="set-lifecycle-message"
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            lifecycle.message.tone === "success" ? "bg-success-50 text-success-700" : "bg-error-50 text-error-700",
          )}
        >
          {lifecycle.message.text}
        </p>
      )}

      {isLoading ? (
        <p className="py-12 text-center text-sm text-ink-400">Đang tải…</p>
      ) : isError ? (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{errorMessage(error)}</p>
      ) : sets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 [&_svg]:size-7">
            <BookOpen />
          </span>
          {status === "archived" ? (
            <div className="text-[15px] font-bold text-ink-900">Không có đề nào đang lưu trữ</div>
          ) : (
            <div>
              <div className="text-[15px] font-bold text-ink-900">Chưa có đề nào</div>
              <div className="mt-1 text-sm text-ink-500">Tạo đề mới hoặc lấy đề có sẵn từ thư viện hệ thống.</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((s) => (
              <BankSetCard
                key={s.id}
                set={s}
                count={counts[s.id] ?? 0}
                selected={selectedIds.has(s.id)}
                busy={lifecycle.pending}
                onToggleSelect={() => toggleOne(s.id)}
                onDetail={() => onOpenCard(s.id)}
                onEdit={() => onEditCard(s.id)}
                onAssign={() => onAssignSet(s)}
                onArchive={() => runAction("archive", [s.id])}
                onRestore={() => runAction("restore", [s.id])}
                onDelete={() => setPendingDelete([s.id])}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={(next) => onQueryChange({ page: next })} />
        </>
      )}

      <SetBulkActionBar
        count={selectedIds.size}
        pending={lifecycle.pending}
        archivedView={status === "archived"}
        onArchive={() => runAction("archive", [...selectedIds])}
        onRestore={() => runAction("restore", [...selectedIds])}
        onDelete={() => setPendingDelete([...selectedIds])}
        onClear={() => setSelectedIds(new Set())}
      />

      {pendingDelete && (
        <SetDeleteConfirm
          count={pendingDelete.length}
          pending={lifecycle.pending}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
