"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";

import type { CatalogStatus } from "./types";
import { useSetLifecycle } from "./use-set-lifecycle";
import { SetDeleteConfirm } from "./set-delete-confirm";
import { Button } from "@/components/ui/button";

export function SetLifecycleActions({
  set,
  onChanged,
  onDeleted,
}: {
  set: { id: string; status: CatalogStatus; can_manage: boolean };
  onChanged: () => void | Promise<void>;
  onDeleted: () => void;
}) {
  const lifecycle = useSetLifecycle();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!set.can_manage) return null;

  const archiveOrRestore = async () => {
    const { succeeded } = await lifecycle.run(set.status === "archived" ? "restore" : "archive", [set.id]);
    if (succeeded.length > 0) await onChanged();
  };

  const confirmDelete = async () => {
    const { succeeded } = await lifecycle.run("delete", [set.id]);
    setConfirmOpen(false);
    if (succeeded.length > 0) onDeleted();
  };

  return (
    <>
      {set.status === "archived" ? (
        <Button
          data-testid="set-restore-btn"
          variant="outline"
          size="sm"
          disabled={lifecycle.pending}
          onClick={archiveOrRestore}
        >
          <ArchiveRestore className="size-4" /> Khôi phục
        </Button>
      ) : (
        <Button
          data-testid="set-archive-btn"
          variant="outline"
          size="sm"
          disabled={lifecycle.pending}
          onClick={archiveOrRestore}
        >
          <Archive className="size-4" /> Lưu trữ
        </Button>
      )}
      <Button
        data-testid="set-delete-btn"
        variant="outline"
        size="sm"
        disabled={lifecycle.pending}
        onClick={() => setConfirmOpen(true)}
        className="border-error-200 text-error-700 hover:bg-error-50"
      >
        <Trash2 className="size-4" /> Xoá
      </Button>
      {lifecycle.message?.tone === "error" && (
        <p
          data-testid="set-lifecycle-message"
          className="w-full rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700"
        >
          {lifecycle.message.text}
        </p>
      )}
      {confirmOpen && (
        <SetDeleteConfirm
          count={1}
          pending={lifecycle.pending}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}
