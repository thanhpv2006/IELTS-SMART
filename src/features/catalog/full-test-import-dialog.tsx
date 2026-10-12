"use client";

// Full test import (full-test-excel-import): builds one full_test set from up to
// four per-skill Excel files. It creates the set first (kind=full_test), then
// imports each provided file into it via the unified import endpoint with
// target_set_id (append). The set is left as a draft — the user reviews the
// four tabs on the set detail page and publishes it there.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { catalogApi } from "./api";
import type { CatalogDifficulty, CatalogSkill } from "./types";
import { errorMessage } from "@/lib/api/errors";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

// Import + display order and the template each skill uses (same assets as the
// per-skill import picker).
const SKILL_ROWS: { skill: CatalogSkill; label: string; template: string }[] = [
  { skill: "listening", label: "Listening", template: "/templates/listening-mau.xlsx" },
  { skill: "reading", label: "Reading", template: "/templates/reading-mau.xlsx" },
  { skill: "writing", label: "Writing", template: "/templates/writing-mau.xlsx" },
  { skill: "speaking", label: "Speaking", template: "/templates/speaking-mau.xlsx" },
];

type SkillOutcome = {
  skill: CatalogSkill;
  label: string;
  imported: number;
  errors: { row: number; reason: string }[];
};

export function FullTestImportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [targetBand, setTargetBand] = useState("");
  const [difficulty, setDifficulty] = useState<"" | CatalogDifficulty>("");
  const [files, setFiles] = useState<Record<CatalogSkill, File | null>>({
    listening: null,
    reading: null,
    writing: null,
    speaking: null,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<SkillOutcome[] | null>(null);
  const [createdSetId, setCreatedSetId] = useState<string | null>(null);

  const chosenCount = SKILL_ROWS.filter((r) => files[r.skill]).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Vui lòng nhập tên đề.");
      return;
    }
    if (chosenCount === 0) {
      setError("Vui lòng chọn ít nhất 1 file kỹ năng.");
      return;
    }

    setSubmitting(true);
    try {
      const { id } = await catalogApi.createSet({
        title: title.trim(),
        kind: "full_test",
        duration_minutes: duration ? Number(duration) : undefined,
        target_band: targetBand ? Number(targetBand) : undefined,
        difficulty: difficulty || undefined,
      });
      setCreatedSetId(id);

      // Import each provided skill into the new set, in a fixed order. A single
      // skill's failure is recorded but does not abort the others — the set
      // already exists, so partial content is kept and shown.
      const results: SkillOutcome[] = [];
      for (const row of SKILL_ROWS) {
        const file = files[row.skill];
        if (!file) continue;
        try {
          const res = await catalogApi.importXlsx(file, { importType: row.skill, targetSetId: id });
          results.push({ skill: row.skill, label: row.label, imported: res.imported, errors: res.errors ?? [] });
        } catch (err) {
          results.push({
            skill: row.skill,
            label: row.label,
            imported: 0,
            errors: [{ row: 0, reason: errorMessage(err) }],
          });
        }
      }

      qc.invalidateQueries({ queryKey: ["catalog-sets"] });
      setOutcomes(results);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openSet = () => {
    if (createdSetId) router.push(`/banks/${createdSetId}`);
  };

  // ── Result view (after import) ──────────────────────────────────────────
  if (outcomes) {
    const totalImported = outcomes.reduce((n, o) => n + o.imported, 0);
    return (
      <Dialog open onClose={onClose} title="Kết quả import full test" size="md">
        <DialogBody className="space-y-3">
          <p className="text-sm font-medium text-success-700">✓ Đã thêm {totalImported} câu vào đề.</p>
          <ul className="space-y-2">
            {outcomes.map((o) => (
              <li key={o.skill} className="rounded-lg border border-ink-200 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-800">{o.label}</span>
                  <span className="text-ink-500">
                    {o.imported} câu{o.errors.length > 0 ? ` · ${o.errors.length} lỗi` : ""}
                  </span>
                </div>
                {o.errors.length > 0 && (
                  <div className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto rounded bg-error-50 px-2 py-1 text-xs text-error-700">
                    {o.errors.map((er, i) => (
                      <p key={i}>{er.row > 0 ? `Dòng ${er.row}: ` : ""}{er.reason}</p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={openSet}>
            Mở đề
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </Dialog>
    );
  }

  // ── Form view ───────────────────────────────────────────────────────────
  return (
    <Dialog open onClose={() => !submitting && onClose()} title="Import full test" size="md">
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-5">
          <p className="text-sm text-ink-600">
            Mỗi kỹ năng dùng đúng file mẫu như import đề đơn. Chọn ít nhất 1 kỹ năng; đề tạo ra ở dạng nháp để bạn rà lại
            rồi xuất bản.
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Tên đề <span className="text-brand-500">*</span>
            </label>
            <input
              data-testid="full-test-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Cambridge 18 Test 1"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Thời lượng (phút)</label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
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
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Độ khó</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as "" | CatalogDifficulty)}
                className={inputCls}
              >
                <option value="">—</option>
                <option value="easy">Dễ</option>
                <option value="medium">Trung bình</option>
                <option value="hard">Khó</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {SKILL_ROWS.map((row) => (
              <div key={row.skill} className="rounded-lg border border-ink-200 px-3 py-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-800">{row.label}</span>
                  <a
                    href={row.template}
                    download
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                  >
                    <Download className="size-3.5" /> File mẫu
                  </a>
                </div>
                <input
                  type="file"
                  accept=".xlsx"
                  data-testid={`full-test-file-${row.skill}`}
                  onChange={(e) =>
                    setFiles((prev) => ({ ...prev, [row.skill]: e.target.files?.[0] ?? null }))
                  }
                  className="w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
                />
              </div>
            ))}
          </div>

          {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="submit" data-testid="full-test-submit" disabled={submitting}>
            {submitting ? "Đang tạo…" : "Tạo full test"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
