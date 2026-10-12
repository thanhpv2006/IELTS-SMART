"use client";

// Structured form-row editor for the R/L "form completion" authoring flow
// (gap_fill groups). Bridges the client-side `FormModel` state and the
// persisted `group.instructions_html` + `group.items[]` (see
// rl-form-html.ts + workflow/changes/rl-form-builder/design.md).

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { nextNumberFrom } from "./rl-metadata";
import {
  reconcileItems,
  resolveModel,
  serializeForm,
  type FormCell,
  type FormModel,
  type FormRow,
} from "./rl-form-html";
import type { RLGroupDraft } from "./types";

const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

// Client-only stable React key for a row. Kept OUT of the persisted FormModel /
// serializeForm output so the pure serialize/parse round-trip stays intact —
// it only survives inside this component's state to keep focus/native radio
// state anchored to the row identity, not its list index (removing a middle
// row must not reshuffle the rows below).
type KeyedRow = FormRow & { _k: string };
type KeyedModel = { instruction: string; title: string; rows: KeyedRow[] };

function emptyModel(): KeyedModel {
  return { instruction: "", title: "", rows: [] };
}

function blankNumbersOf(rows: FormRow[]): number[] {
  return rows
    .filter((r): r is FormRow & { right: { kind: "blank"; number: number } } => r.right.kind === "blank")
    .map((r) => r.right.number);
}

export function RLFormBuilder(props: {
  group: RLGroupDraft;
  existingNumbers: number[];
  onChange: (g: RLGroupDraft) => void;
}) {
  const { group, existingNumbers, onChange } = props;

  // Monotonic source of unique row keys (never resets while mounted).
  const keySeq = useRef(0);
  const nextKey = () => `row-${keySeq.current++}`;
  const withKeys = (m: FormModel): KeyedModel => ({
    ...m,
    rows: m.rows.map((r) => ({ ...r, _k: nextKey() })),
  });

  const [model, setModel] = useState<KeyedModel>(
    () => withKeys(resolveModel(group.instructions_html ?? "", group.items) ?? emptyModel()),
  );

  // Re-derive the model when the persisted HTML changes out from under us
  // (e.g. external reset). The steady-state check (already-serialized ===
  // current html) prevents this from looping back on our own `commit()`
  // writes or firing on every keystroke — deps intentionally exclude
  // `model`/`group.items`.
  useEffect(() => {
    if ((group.instructions_html ?? "") !== serializeForm(model)) {
      const resolved = resolveModel(group.instructions_html ?? "", group.items);
      // Deliberate derived-state resync from an external prop change, guarded above.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModel(resolved ? withKeys(resolved) : model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.instructions_html]);

  const commit = (next: KeyedModel) => {
    const blanks = blankNumbersOf(next.rows);
    onChange({
      ...group,
      instructions_html: serializeForm(next),
      items: reconcileItems(group.items, blanks),
    });
    setModel(next);
  };

  const updateRow = (idx: number, patch: Partial<FormRow>) => {
    const next: KeyedModel = {
      ...model,
      rows: model.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    };
    commit(next);
  };

  const setRowKind = (idx: number, kind: FormCell["kind"]) => {
    if (kind === "blank") {
      const usedBlankNumbers = blankNumbersOf(model.rows);
      const number = nextNumberFrom(existingNumbers.concat(usedBlankNumbers));
      updateRow(idx, { right: { kind: "blank", number } });
    } else {
      updateRow(idx, { right: { kind: "given", text: "" } });
    }
  };

  const addRow = () => {
    const next: KeyedModel = {
      ...model,
      rows: [...model.rows, { label: "", right: { kind: "given", text: "" }, _k: nextKey() }],
    };
    commit(next);
  };

  const removeRow = (idx: number) => {
    const next: KeyedModel = { ...model, rows: model.rows.filter((_, i) => i !== idx) };
    commit(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Hướng dẫn</label>
          <input
            className={inputCls}
            aria-label="Hướng dẫn"
            value={model.instruction}
            onChange={(e) => commit({ ...model, instruction: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-600">Tiêu đề</label>
          <input
            className={inputCls}
            aria-label="Tiêu đề"
            value={model.title}
            onChange={(e) => commit({ ...model, title: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {model.rows.map((row, idx) => (
          <div
            key={row._k}
            data-testid={`rl-form-row-${idx}`}
            className="flex flex-col gap-2 rounded-xl border border-ink-200 p-3.5 sm:flex-row sm:items-start"
          >
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-600">Nhãn</label>
              <input
                className={inputCls}
                aria-label="Nhãn"
                value={row.label}
                onChange={(e) => updateRow(idx, { label: e.target.value })}
              />
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-600">Loại ô</label>
              <div className="flex items-center gap-3 py-2 text-sm text-ink-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`rl-form-row-kind-${row._k}`}
                    checked={row.right.kind === "blank"}
                    onChange={() => setRowKind(idx, "blank")}
                  />
                  Ô trống
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={`rl-form-row-kind-${row._k}`}
                    checked={row.right.kind === "given"}
                    onChange={() => setRowKind(idx, "given")}
                  />
                  Cho sẵn
                </label>
              </div>
              {row.right.kind === "blank" ? (
                <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600">
                  Câu {row.right.number}
                </span>
              ) : (
                <input
                  className={inputCls}
                  value={row.right.text}
                  onChange={(e) =>
                    updateRow(idx, { right: { kind: "given", text: e.target.value } })
                  }
                />
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start sm:mt-5"
              onClick={() => removeRow(idx)}
            >
              Xoá dòng
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        Thêm dòng
      </Button>
    </div>
  );
}
