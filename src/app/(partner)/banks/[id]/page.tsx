"use client";

// Unified set editor: header (title/badges/publish/practice-toggle/edit-info) + question
// authoring. homework/exam sets show a single skill panel; full_test sets show 4 skill
// tabs (no shared ui/tabs primitive in this app — built inline with a button group).

import { useState, type FormEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { catalogApi } from "@/features/catalog/api";
import { lastBanksListHref } from "@/features/catalog/banks-list-query";
import { useSetItems } from "@/features/catalog/use-set-items";
import { SkillItemsPanel } from "@/features/catalog/skill-items-panel";
import { SetLifecycleActions } from "@/features/catalog/set-lifecycle-actions";
import { SET_KIND_LABELS, partLabel } from "@/features/catalog/types";
import type { CatalogDifficulty, CatalogQuestionSetDetail, CatalogSkill } from "@/features/catalog/types";
import { useAuthStore } from "@/stores/auth-store";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";

const FULL_TEST_SKILLS: CatalogSkill[] = ["listening", "reading", "writing", "speaking"];
const SKILL_LABELS: Record<CatalogSkill, string> = {
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
};

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export default function SetEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const hook = useSetItems(id);
  const detail = hook.detail;
  // One Part per single-skill set, so the first question settles it for the whole set.
  const setPart = hook.items[0]?.part;

  const [activeTab, setActiveTab] = useState<CatalogSkill>("listening");
  // Card's "Sửa" button lands here with ?edit=1 → open the edit-info dialog.
  const searchParams = useSearchParams();
  const [editOpen, setEditOpen] = useState(() => searchParams.get("edit") === "1");
  const archived = detail?.status === "archived";
  const editable = !!detail?.can_manage && !archived;

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [togglingPractice, setTogglingPractice] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  if (hook.isLoading) {
    return <p className="text-sm text-ink-400">Đang tải…</p>;
  }

  if (hook.error || !detail) {
    return (
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(lastBanksListHref())}>
          <ArrowLeft /> Quay lại
        </Button>
        <p className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-400">
          Không tìm thấy bộ đề này, hoặc đã có lỗi khi tải dữ liệu.
        </p>
      </div>
    );
  }

  const handlePublish = async () => {
    setPublishError(null);
    setPublishing(true);
    try {
      await catalogApi.publishSet(id);
      await hook.refetch();
    } catch (e) {
      setPublishError(errorMessage(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleTogglePractice = async () => {
    setPracticeError(null);
    setTogglingPractice(true);
    try {
      await catalogApi.setPractice(id, !detail.practice_enabled);
      await hook.refetch();
    } catch (e) {
      setPracticeError(errorMessage(e));
    } finally {
      setTogglingPractice(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push(lastBanksListHref())}>
          <ArrowLeft /> Quay lại
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">{detail.title}</h1>
            <Badge tone="brand">{SET_KIND_LABELS[detail.kind]}</Badge>
            <Badge tone="purple" className="capitalize">
              {detail.kind === "full_test" ? "4 kỹ năng" : detail.skill}
            </Badge>
            {detail.kind !== "full_test" && (
              <Badge tone="info">
                {setPart != null ? partLabel(detail.skill, setPart) : "Chưa có Part"}
              </Badge>
            )}
            {archived ? (
              <Badge tone="warning">Đã lưu trữ</Badge>
            ) : (
              <Badge tone={detail.status === "published" ? "success" : "gray"}>
                {detail.status === "published" ? "Đã xuất bản" : "Nháp"}
              </Badge>
            )}
          </div>
          {detail.description && <p className="mt-1 text-sm text-ink-500">{detail.description}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Sửa thông tin
            </Button>
          )}
          {role === "partner_owner" && editable && (
            <div className="flex flex-col gap-0.5">
              <Button variant="outline" size="sm" disabled={togglingPractice} onClick={handleTogglePractice}>
                {detail.practice_enabled ? "Tắt luyện tập" : "Bật luyện tập"}
              </Button>
              {detail.status !== "published" && detail.practice_enabled && (
                <p className="text-xs text-warning-700">
                  Đề chưa xuất bản nên học viên chưa thấy trong mục Luyện tập.
                </p>
              )}
            </div>
          )}
          {editable && detail.status === "draft" && (
            <Button size="sm" disabled={publishing} onClick={handlePublish}>
              {publishing ? "Đang xuất bản…" : "Xuất bản"}
            </Button>
          )}
          <SetLifecycleActions
            set={detail}
            onChanged={async () => {
              setEditOpen(false);
              await hook.refetch();
            }}
            onDeleted={() => router.push("/banks")}
          />
        </div>
      </div>

      {archived && (
        <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
          Đề đang được lưu trữ — khôi phục để chỉnh sửa hoặc giao bài.
        </p>
      )}

      {(publishError || practiceError) && (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{publishError || practiceError}</p>
      )}

      {detail.kind !== "full_test" ? (
        <SkillItemsPanel kind={detail.kind} skill={detail.skill!} allItems={hook.items} hook={hook} readOnly={!editable} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 border-b border-ink-200">
            {FULL_TEST_SKILLS.map((skill) => {
              const count = hook.items.filter((q) => q.skill === skill).length;
              const active = activeTab === skill;
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => setActiveTab(skill)}
                  className={cn(
                    "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
                    active ? "border-brand-500 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-700",
                  )}
                >
                  {SKILL_LABELS[skill]}
                  <span className="ml-1 text-xs font-normal text-ink-400">({count})</span>
                </button>
              );
            })}
          </div>
          <SkillItemsPanel kind="full_test" skill={activeTab} allItems={hook.items} hook={hook} readOnly={!editable} />
        </div>
      )}

      {editOpen && editable && (
        <EditSetDialog detail={detail} onClose={() => setEditOpen(false)} onSaved={hook.refetch} />
      )}
    </div>
  );
}

// ── Dialog: edit set details (title/description/duration/band/difficulty) ──

function EditSetDialog({
  detail,
  onClose,
  onSaved,
}: {
  detail: CatalogQuestionSetDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");
  const [duration, setDuration] = useState(detail.duration_minutes != null ? String(detail.duration_minutes) : "");
  const [targetBand, setTargetBand] = useState(detail.target_band != null ? String(detail.target_band) : "");
  const [difficulty, setDifficulty] = useState<"" | CatalogDifficulty>(detail.difficulty ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await catalogApi.updateSet(detail.id, {
        title,
        description: description || undefined,
        skill: detail.skill,
        duration_minutes: duration ? Number(duration) : undefined,
        target_band: targetBand ? Number(targetBand) : undefined,
        difficulty: difficulty || undefined,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} title="Sửa thông tin đề" size="md">
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">
              Tên bộ đề <span className="text-brand-500">*</span>
            </label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
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
          {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
