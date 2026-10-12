"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "./api";
import type { CatalogDifficulty, CatalogSetKind, CatalogSkill, CreateCatalogSetBody } from "./types";
import { SET_KIND_LABELS, VISIBLE_SET_KINDS } from "./types";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const KIND_OPTIONS: CatalogSetKind[] = VISIBLE_SET_KINDS;

const DIFFICULTY_LABELS: Record<CatalogDifficulty, string> = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

interface CreateSetDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (setId: string) => void;
}

export function CreateSetDialog({ open, onClose, onCreated }: CreateSetDialogProps) {
  const qc = useQueryClient();

  const [kind, setKind] = useState<CatalogSetKind>("practice");
  const [skill, setSkill] = useState<CatalogSkill>("speaking");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [targetBand, setTargetBand] = useState("");
  const [difficulty, setDifficulty] = useState<"" | CatalogDifficulty>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Reset the form whenever the dialog closes.
  useEffect(() => {
    if (open) return;
    setKind("practice");
    setSkill("speaking");
    setTitle("");
    setDuration("");
    setTargetBand("");
    setDifficulty("");
    setFormError(null);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: CreateCatalogSetBody = {
        title,
        kind,
        skill: kind === "full_test" ? undefined : skill,
        duration_minutes: duration ? Number(duration) : undefined,
        target_band: targetBand ? Number(targetBand) : undefined,
        difficulty: difficulty || undefined,
      };
      const { id } = await catalogApi.createSet(body);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["catalog-sets"] });
      onCreated(id);
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError("Vui lòng nhập tên đề.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Tạo đề mới" size="md">
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Loại đề</label>
            <div className={cn("grid gap-2", KIND_OPTIONS.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  data-testid={`create-set-kind-${k}`}
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    kind === k
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-input text-ink-600 hover:bg-ink-50",
                  )}
                >
                  {SET_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {kind !== "full_test" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Kỹ năng</label>
              <select
                data-testid="create-set-skill"
                value={skill}
                onChange={(e) => setSkill(e.target.value as CatalogSkill)}
                className={inputCls}
              >
                <option value="speaking">Speaking</option>
                <option value="writing">Writing</option>
                <option value="reading">Reading</option>
                <option value="listening">Listening</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Tên đề <span className="text-brand-500">*</span>
            </label>
            <input
              data-testid="create-set-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Speaking Practice Set 1"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Thời lượng (phút)</label>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="VD: 15"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Band mục tiêu</label>
              <input
                type="number"
                min={0}
                max={9}
                step={0.5}
                value={targetBand}
                onChange={(e) => setTargetBand(e.target.value)}
                placeholder="VD: 6.5"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Độ khó</label>
            <select
              data-testid="create-set-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as "" | CatalogDifficulty)}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="easy">{DIFFICULTY_LABELS.easy}</option>
              <option value="medium">{DIFFICULTY_LABELS.medium}</option>
              <option value="hard">{DIFFICULTY_LABELS.hard}</option>
            </select>
          </div>

          {formError && (
            <p data-testid="create-set-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
              {formError}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button data-testid="create-set-save" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu…" : "Tạo đề"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Huỷ
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
