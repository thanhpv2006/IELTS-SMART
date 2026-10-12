"use client";

import { useState } from "react";
import { hasFormBlanks, type RLGroupType } from "@novaforge-team/ielts-exam-engine";
import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { RL_TYPE_DESCRIPTORS, descriptorFor, emptyItem, nextNumberFrom } from "./rl-metadata";
import { RLFormBuilder } from "./rl-form-builder";
import { RLFormContentEditor } from "./rl-form-content-editor";
import { normalizeContentHtml, resolveModel } from "./rl-form-html";
import { RLItemRow } from "./rl-item-row";
import type { RLGroupDraft } from "./types";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const sharedOptionPlaceholder = (type: RLGroupType): string =>
  type === "matching_headings" ? "VD: i. Tiêu đề đoạn văn" : "VD: A. Lựa chọn";

export function RLGroupEditor(props: {
  group: RLGroupDraft;
  existingNumbers: number[];
  onChange: (g: RLGroupDraft) => void;
  onRemove: () => void;
}) {
  const { group, existingNumbers, onChange, onRemove } = props;
  const desc = descriptorFor(group.type);
  const isGapFill = group.type === "gap_fill";

  // Conservative default (D7): only auto-on when the persisted content is
  // already a form (has `data-blank`); a plain gap_fill group must not
  // auto-switch into form mode.
  const [formMode, setFormMode] = useState<boolean>(() =>
    hasFormBlanks(group.content_html ?? group.instructions_html ?? ""),
  );
  // C1: builderEligible resolves on instructions_html ONLY (never content_html) — RLFormBuilder
  // seeds+writes instructions_html, so routing a content_html-backed form into it would resolve
  // to null (rubric has no blanks) and the first edit would overwrite instructions_html while
  // dropping content_html entirely. Force false whenever content_html is present.
  const builderEligible =
    isGapFill && formMode && !group.content_html && resolveModel(group.instructions_html ?? "", group.items) !== null;

  const handleTypeChange = (newType: RLGroupType) => {
    // Leaving gap_fill with a form table left in content_html or instructions_html: the exam
    // engine checks hasFormBlanks() on either field BEFORE type dispatch, so an orphaned
    // form table would still render as a form under the new type. Strip the whole form triple —
    // but only when it's actually a form (plain instruction text stays put).
    const leavingFormGapFill =
      group.type === "gap_fill" &&
      newType !== "gap_fill" &&
      (hasFormBlanks(group.content_html ?? "") || hasFormBlanks(group.instructions_html ?? ""));

    onChange({
      ...group,
      type: newType,
      shared_options: undefined,
      select_count: undefined,
      image_url: undefined,
      items: group.items.map((it) => ({ ...it, options: undefined, answer_key: [] })),
      ...(leavingFormGapFill
        ? { instructions_html: undefined, content_html: undefined, title: undefined }
        : {}),
    });
    setFormMode(false);
  };

  const setSharedOptions = (next: string[]) => {
    onChange({ ...group, shared_options: next });
  };

  return (
    <div data-testid="rl-group" className="flex flex-col gap-4 rounded-xl border border-ink-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <select
          className={`${inputCls} max-w-xs`}
          aria-label="Loại nhóm câu hỏi"
          value={group.type}
          onChange={(e) => handleTypeChange(e.target.value as RLGroupType)}
        >
          {RL_TYPE_DESCRIPTORS.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
        <Button type="button" variant="ghost" size="sm" aria-label="Xoá nhóm" onClick={onRemove}>
          Xoá nhóm
        </Button>
      </div>

      {isGapFill && (
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={formMode}
            onChange={(e) => setFormMode(e.target.checked)}
          />
          Soạn dạng form (bảng)
        </label>
      )}

      {isGapFill && formMode && builderEligible ? (
        <RLFormBuilder group={group} existingNumbers={existingNumbers} onChange={onChange} />
      ) : isGapFill && formMode ? (
        // D7/D8: complex form (not builder-eligible) — 3-field raw editor so the form table
        // (content_html) never gets clobbered by an edit to the rubric (instructions_html).
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600">
              Đề mục (vd: Questions 1–7)
            </label>
            <input
              className={inputCls}
              value={group.title ?? ""}
              onChange={(e) => onChange({ ...group, title: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600">Hướng dẫn (rubric)</label>
            {hasFormBlanks(group.instructions_html ?? "") ? (
              // Legacy safety: a pre-split form still jammed in instructions_html (table +
              // data-blank, content_html absent) must NOT go through RichTextEditor — its
              // StarterKit doc has no table/blank nodes and would strip them on first edit.
              // Keep a raw textarea so the markup survives until moved into content_html.
              <textarea
                className={inputCls}
                value={group.instructions_html ?? ""}
                onChange={(e) => onChange({ ...group, instructions_html: e.target.value })}
              />
            ) : (
              <RichTextEditor
                value={group.instructions_html ?? ""}
                onChange={(html) => onChange({ ...group, instructions_html: normalizeContentHtml(html) })}
                minHeight={80}
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600">
              Nội dung form (bảng + ô trống)
            </label>
            <RLFormContentEditor group={group} existingNumbers={existingNumbers} onChange={onChange} />
          </div>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">
            Hướng dẫn (vd: Questions 1–4, Write ONE WORD…)
          </label>
          <textarea
            className={inputCls}
            value={group.instructions_html ?? ""}
            onChange={(e) => onChange({ ...group, instructions_html: e.target.value })}
          />
        </div>
      )}

      {desc.optionSource === "shared" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">
            Danh sách lựa chọn dùng chung
          </label>
          <div className="flex flex-col gap-1.5">
            {(group.shared_options ?? []).map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={opt}
                  placeholder={sharedOptionPlaceholder(group.type)}
                  onChange={(e) => {
                    const next = [...(group.shared_options ?? [])];
                    next[idx] = e.target.value;
                    setSharedOptions(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    const next = (group.shared_options ?? []).filter((_, i) => i !== idx);
                    setSharedOptions(next);
                  }}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSharedOptions([...(group.shared_options ?? []), ""])}
            >
              Thêm lựa chọn
            </Button>
          </div>
        </div>
      )}

      {group.type === "diagram_label" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Ảnh sơ đồ</label>
          <ImageUploadField
            value={group.image_url}
            onChange={(url) => onChange({ ...group, image_url: url })}
          />
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {group.items.map((item, i) => (
          <RLItemRow
            key={item.number}
            group={group}
            item={item}
            hideRemove={isGapFill && formMode}
            hidePrompt={isGapFill && formMode}
            onChange={(patch) =>
              onChange({
                ...group,
                items: group.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
              })
            }
            onRemove={() =>
              onChange({ ...group, items: group.items.filter((_, idx) => idx !== i) })
            }
          />
        ))}
      </div>

      {!(isGapFill && formMode) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ ...group, items: [...group.items, emptyItem(nextNumberFrom(existingNumbers))] })
          }
        >
          Thêm câu
        </Button>
      )}
    </div>
  );
}
