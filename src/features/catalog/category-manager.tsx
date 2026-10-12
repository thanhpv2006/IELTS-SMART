"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "./api";
import type { CatalogSkill } from "./types";
import { errorMessage } from "@/lib/api/errors";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function skillBadge(skill?: CatalogSkill) {
  switch (skill) {
    case "speaking":
      return <Badge tone="info">Speaking</Badge>;
    case "writing":
      return <Badge tone="purple">Writing</Badge>;
    case "reading":
      return <Badge tone="info">Reading</Badge>;
    case "listening":
      return <Badge tone="brand">Listening</Badge>;
    default:
      return <Badge tone="gray">Cả hai</Badge>;
  }
}

interface CategoryManagerProps {
  open: boolean;
  onClose: () => void;
}

export function CategoryManager({ open, onClose }: CategoryManagerProps) {
  const qc = useQueryClient();
  const { data: categories = [], isLoading, error } = useQuery({
    queryKey: ["catalog-categories"],
    queryFn: catalogApi.listCategories,
  });

  const [name, setName] = useState("");
  const [skill, setSkill] = useState<CatalogSkill | "">("");
  const [color, setColor] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setSkill("");
    setColor("");
    setFormError(null);
  };

  const createMutation = useMutation({
    mutationFn: catalogApi.createCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-categories"] });
      resetForm();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const slug = slugify(name);
    if (!slug) {
      setFormError("Tên chủ đề không hợp lệ, vui lòng nhập lại.");
      return;
    }
    createMutation.mutate({
      slug,
      name: name.trim(),
      color: color || undefined,
      sort_order: categories.length,
      skill: skill || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Quản lý chủ đề" size="md">
      <DialogBody className="space-y-5">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-ink-400">Đang tải…</p>
        ) : error ? (
          <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{errorMessage(error)}</p>
        ) : categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">Chưa có chủ đề nào.</p>
        ) : (
          <div className="space-y-2">
            {categories.map((c) => (
              <div
                key={c.id}
                data-testid={`category-row-${c.id}`}
                className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2"
              >
                {c.color && (
                  <div
                    className="size-4 shrink-0 rounded-full border border-ink-200"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                <span className="flex-1 text-sm font-medium text-ink-900">{c.name}</span>
                {skillBadge(c.skill)}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 border-t border-ink-100 pt-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Tên chủ đề <span className="text-brand-500">*</span>
            </label>
            <input
              data-testid="category-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Gia đình"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Kỹ năng</label>
              <select
                value={skill}
                onChange={(e) => setSkill(e.target.value as CatalogSkill | "")}
                className={inputCls}
              >
                <option value="">Cả hai</option>
                <option value="speaking">Speaking</option>
                <option value="writing">Writing</option>
                <option value="reading">Reading</option>
                <option value="listening">Listening</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Màu (tuỳ chọn)</label>
              <input
                type="color"
                value={color || "#cccccc"}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-input px-1 py-1"
              />
            </div>
          </div>

          {formError && (
            <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{formError}</p>
          )}

          <Button
            data-testid="create-category-btn"
            type="submit"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Đang thêm…" : "Thêm chủ đề"}
          </Button>
        </form>
      </DialogBody>
    </Dialog>
  );
}
