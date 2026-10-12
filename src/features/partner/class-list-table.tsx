"use client";

import { SquarePen, Trash2, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SmartClass } from "@/features/partner/api";
import { classDateRange, statusBadgeClass, statusLabel } from "@/features/partner/class-format";

const checkboxCls = "size-4 rounded border-ink-300 accent-brand-600";
const actionButtonCls =
  "inline-flex size-8 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 hover:bg-ink-50 hover:text-ink-900";

export function ClassListTable({
  items,
  selectedIds,
  onToggle,
  onToggleAll,
  onEdit,
  onDelete,
  onView,
}: {
  items: SmartClass[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onEdit: (c: SmartClass) => void;
  onDelete: (c: SmartClass) => void;
  onView: (id: string) => void;
}) {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-ink-50">
            <TableHead className="uppercase text-ink-400">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={allSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label="Chọn tất cả"
              />
            </TableHead>
            <TableHead className="uppercase text-ink-400">Tên lớp</TableHead>
            <TableHead className="uppercase text-ink-400">Giáo viên</TableHead>
            <TableHead className="uppercase text-ink-400">Số học viên</TableHead>
            <TableHead className="uppercase text-ink-400">Thời gian</TableHead>
            <TableHead className="uppercase text-ink-400">Trạng thái</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const selected = selectedIds.has(item.id);
            return (
              <TableRow key={item.id} className={selected ? "bg-brand-50/60" : undefined}>
                <TableCell>
                  <input
                    type="checkbox"
                    className={checkboxCls}
                    checked={selected}
                    onChange={() => onToggle(item.id)}
                    aria-label={`Chọn ${item.name}`}
                  />
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onView(item.id)}
                    className="text-left font-semibold text-ink-900 hover:text-brand-600"
                  >
                    {item.name}
                  </button>
                </TableCell>
                <TableCell>
                  {item.teacher_name ? (
                    <span className="text-ink-600">{item.teacher_name}</span>
                  ) : (
                    <span className="text-ink-400">Chưa gán giáo viên</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-ink-600">
                    <Users className="size-4 text-ink-400" />
                    {item.student_count}
                  </div>
                </TableCell>
                <TableCell className="text-ink-600">{classDateRange(item)}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(item.status)}`}
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {statusLabel(item.status)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className={actionButtonCls}
                      aria-label="Sửa lớp"
                    >
                      <SquarePen className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      className={`${actionButtonCls} hover:bg-error-50 hover:text-error-700`}
                      aria-label="Xóa lớp"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
