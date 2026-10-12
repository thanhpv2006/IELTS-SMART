"use client";

// Question-first set item management for the unified set editor. A question is
// authored/edited on its own row (via catalogApi.create / catalogApi.update), published
// via catalogApi.setStatus, then attached to the set here. `catalogApi.setItems` REPLACES
// the whole item list (question_ids, ordered) — so every mutation below must always pass
// the FULL ordered id union, not a delta. This matters most for full_test, where a single
// set spans 4 skills and callers must merge across skill sections before calling reorder.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "./api";
import type { CatalogQuestion } from "./types";

export function useSetItems(setId: string) {
  const qc = useQueryClient();

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["catalog-set", setId],
    queryFn: () => catalogApi.getSet(setId),
  });

  const items: CatalogQuestion[] = detail?.items ?? [];

  const refetch = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["catalog-set", setId] });
    await qc.invalidateQueries({ queryKey: ["catalog-sets"] });
  }, [qc, setId]);

  // Publish a freshly-authored question, then attach it to the end of the set.
  const attachNew = useCallback(
    async (id: string): Promise<void> => {
      await catalogApi.setStatus(id, "published");
      await catalogApi.setItems(setId, [...items.map((q) => q.id), id]);
      await refetch();
    },
    [setId, items, refetch]
  );

  // Attach already-published questions (e.g. imported from an exam set) — no status change.
  const attachExisting = useCallback(
    async (ids: string[]): Promise<void> => {
      const merged = [...items.map((q) => q.id), ...ids.filter((id) => !items.some((q) => q.id === id))];
      await catalogApi.setItems(setId, merged);
      await refetch();
    },
    [setId, items, refetch]
  );

  // Called after a PATCH to an existing question's content — no item-list change, just refresh.
  const updateDone = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  const removeItem = useCallback(
    async (id: string): Promise<void> => {
      await catalogApi.setItems(
        setId,
        items.filter((q) => q.id !== id).map((q) => q.id)
      );
      await refetch();
    },
    [setId, items, refetch]
  );

  // Caller must pass the FULL ordered id list (not a delta).
  const reorder = useCallback(
    async (nextOrderedIds: string[]): Promise<void> => {
      await catalogApi.setItems(setId, nextOrderedIds);
      await refetch();
    },
    [setId, refetch]
  );

  return {
    detail,
    items,
    isLoading,
    error,
    attachNew,
    attachExisting,
    updateDone,
    removeItem,
    reorder,
    refetch,
  };
}
