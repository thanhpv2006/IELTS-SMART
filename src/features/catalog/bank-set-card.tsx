"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Clock, MoreHorizontal, Pencil, Send, Trash2, Users } from "lucide-react";

import type { CatalogQuestionSet } from "./types";
import { SET_KIND_LABELS, SKILL_LABELS, partLabel } from "./types";
import { setCode } from "@/features/partner/assign-dialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const menuItemCls = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium disabled:opacity-50";

export function BankSetCard({
  set,
  count,
  selected,
  busy,
  onToggleSelect,
  onDetail,
  onEdit,
  onAssign,
  onArchive,
  onRestore,
  onDelete,
}: {
  set: CatalogQuestionSet;
  count: number;
  selected: boolean;
  busy: boolean;
  onToggleSelect: () => void;
  onDetail: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const archived = set.status === "archived";

  const pick = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <Card
      data-testid={`bank-card-${set.id}`}
      className={cn("flex flex-col p-4", selected && "border-brand-400 bg-brand-50/40")}
    >
      <div className="flex items-start gap-2">
        {set.can_manage && (
          <input
            type="checkbox"
            data-testid={`bank-select-${set.id}`}
            aria-label="Chọn đề"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 size-4 shrink-0 cursor-pointer accent-brand-600"
          />
        )}
        <h3 className="min-h-10 flex-1 text-[15.5px] font-bold leading-snug text-ink-900">{set.title}</h3>
        {set.can_manage && (
          <div className="relative shrink-0">
            <button
              type="button"
              data-testid={`bank-card-menu-${set.id}`}
              aria-label="Mở thao tác bộ đề"
              disabled={busy}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
            >
              <MoreHorizontal className="size-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
                {archived ? (
                  <button
                    type="button"
                    data-testid={`bank-restore-btn-${set.id}`}
                    disabled={busy}
                    onClick={pick(onRestore)}
                    className={cn(menuItemCls, "text-ink-700 hover:bg-ink-50")}
                  >
                    <ArchiveRestore className="size-4 text-ink-400" /> Khôi phục
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid={`bank-archive-btn-${set.id}`}
                    disabled={busy}
                    onClick={pick(onArchive)}
                    className={cn(menuItemCls, "text-ink-700 hover:bg-ink-50")}
                  >
                    <Archive className="size-4 text-ink-400" /> Lưu trữ
                  </button>
                )}
                <button
                  type="button"
                  data-testid={`bank-delete-btn-${set.id}`}
                  disabled={busy}
                  onClick={pick(onDelete)}
                  className={cn(menuItemCls, "text-error-700 hover:bg-error-50")}
                >
                  <Trash2 className="size-4" /> Xoá
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {archived && (
        <div className="mt-1">
          <Badge tone="warning">Đã lưu trữ</Badge>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3 text-[13px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" /> {set.duration_minutes ? `${set.duration_minutes} phút` : "—"}
        </span>
      </div>
      <div className="mt-1.5 text-[13px] text-ink-500">
        {SET_KIND_LABELS[set.kind]}
        {set.part != null && ` · ${partLabel(set.skill, set.part)}`} · Mã{" "}
        {setCode({ id: set.id, skill: set.skill ?? "speaking" })}
      </div>
      <div className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-ink-500">
        <Users className="size-3.5" /> {count} lượt giao
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600">#IELTS</span>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
          #{SET_KIND_LABELS[set.kind].replace(/\s/g, "")}
        </span>
        {set.kind === "full_test" ? (
          <span className="rounded-md bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">#Fulltest</span>
        ) : set.skill ? (
          <span className="rounded-md bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
            #{SKILL_LABELS[set.skill]}
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex items-stretch gap-2 pt-4">
        <Button variant="outline" size="sm" className="flex-1" data-testid={`detail-set-btn-${set.id}`} onClick={onDetail}>
          Chi tiết
        </Button>
        {set.can_manage && !archived && (
          <Button variant="outline" size="icon-sm" title="Sửa" aria-label="Sửa" data-testid={`edit-set-btn-${set.id}`} onClick={onEdit}>
            <Pencil />
          </Button>
        )}
        {!archived && (
          <Button variant="outline" size="icon-sm" title="Giao đề" aria-label="Giao đề" data-testid={`assign-set-btn-${set.id}`} onClick={onAssign}>
            <Send />
          </Button>
        )}
      </div>
    </Card>
  );
}
