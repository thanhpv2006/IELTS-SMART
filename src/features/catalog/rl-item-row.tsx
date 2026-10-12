"use client";

import { parseOptionList } from "@novaforge-team/ielts-exam-engine";
import { Button } from "@/components/ui/button";
import { descriptorFor, effectiveOptions, isItemReachable } from "./rl-metadata";
import type { RLGroupDraft, RLItemDraft } from "./types";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export function RLItemRow(props: {
  group: RLGroupDraft;
  item: RLItemDraft;
  onChange: (patch: Partial<RLItemDraft>) => void;
  onRemove: () => void;
  hideRemove?: boolean;
  /**
   * Hide the "Câu hỏi / mệnh đề" (prompt) input. Used in form mode, where the
   * row label is authored in the form builder's `<td>` and `item.prompt` is
   * never rendered — showing an editable prompt here only misleads the author
   * (edits go nowhere the student can see).
   */
  hidePrompt?: boolean;
}) {
  const { group, item, onChange, onRemove, hideRemove, hidePrompt } = props;
  const desc = descriptorFor(group.type);
  const opts = effectiveOptions(group, item);
  // Drop blank options: the shared/per-item option editors keep empty rows
  // while the author is still typing (the "Thêm lựa chọn" button appends ""),
  // and a blank <option> would otherwise render as an empty row in the answer
  // <select> / checkbox list, ballooning the dropdown.
  const parsed = parseOptionList(opts.filter((o) => o.trim() !== ""));
  const reachable = isItemReachable(group, item);

  const toggleMultiAnswer = (value: string, checked: boolean) => {
    const next = checked
      ? [...item.answer_key, value]
      : item.answer_key.filter((v) => v !== value);
    onChange({ answer_key: next });
  };

  const setPerItemOptions = (next: string[]) => {
    onChange({ options: next });
  };

  return (
    <div data-testid={`rl-item-${item.number}`} className="flex flex-col gap-3 rounded-xl border border-ink-200 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-700">Câu {item.number}</span>
        {!hideRemove && (
          <Button type="button" variant="ghost" size="sm" aria-label="Xoá câu" onClick={onRemove}>
            Xoá
          </Button>
        )}
      </div>

      {!hidePrompt && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Câu hỏi / mệnh đề</label>
          <input
            className={inputCls}
            value={item.prompt ?? ""}
            onChange={(e) => onChange({ prompt: e.target.value })}
          />
        </div>
      )}

      {desc.multiAnswer ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Đáp án (chọn nhiều)</label>
          <div className="flex flex-col gap-1.5">
            {parsed.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={item.answer_key.includes(o.value)}
                  onChange={(e) => toggleMultiAnswer(o.value, e.target.checked)}
                />
                {o.label || o.value}
              </label>
            ))}
          </div>
        </div>
      ) : desc.optionSource !== "none" ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Đáp án</label>
          <select
            className={inputCls}
            value={item.answer_key[0] ?? ""}
            onChange={(e) => onChange({ answer_key: e.target.value ? [e.target.value] : [] })}
          >
            <option value="">— Chọn đáp án —</option>
            {parsed.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label || o.value}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600">Đáp án đúng</label>
            <input
              className={inputCls}
              value={item.answer_key[0] ?? ""}
              onChange={(e) => onChange({ answer_key: e.target.value ? [e.target.value] : [] })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-600">
              Biến thể chấp nhận (phân tách bởi dấu phẩy)
            </label>
            <input
              className={inputCls}
              value={(item.accepted_variants ?? []).join(", ")}
              onChange={(e) =>
                onChange({
                  accepted_variants: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-600">
          Giải thích (hiển thị khi xem lại)
        </label>
        <textarea
          className={inputCls}
          rows={2}
          value={item.explanation ?? ""}
          onChange={(e) => onChange({ explanation: e.target.value })}
        />
      </div>

      {desc.optionSource === "per_item" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Lựa chọn</label>
          <div className="flex flex-col gap-1.5">
            {(item.options ?? []).map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={opt}
                  placeholder="VD: A. Paris"
                  onChange={(e) => {
                    const next = [...(item.options ?? [])];
                    next[idx] = e.target.value;
                    setPerItemOptions(next);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    const next = (item.options ?? []).filter((_, i) => i !== idx);
                    setPerItemOptions(next);
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
              onClick={() => setPerItemOptions([...(item.options ?? []), ""])}
            >
              Thêm lựa chọn
            </Button>
          </div>
        </div>
      )}

      {!reachable && (
        <p className="text-xs text-amber-600">Đáp án chưa nằm trong danh sách lựa chọn.</p>
      )}
    </div>
  );
}
