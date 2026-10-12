"use client";

// Editable AI error list — a teacher can add, edit or delete errors the AI produced.
// Shared by Speaking (FC/LR/GRA/PRON) and Writing (TA_TR/CC/LR/GRA).

import { useState } from "react";
import { Check, Edit3, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type EditErr = {
  _id: string;
  /** The error's original block (so it is written back to the right group). -1 = an error the teacher just added. */
  bi: number;
  /** Sequence of the answer holding the error (FE-only) — used to show the Part/question label for an error
   * the teacher added when that question has no error block yet. Never written to the backend. */
  seq?: number;
  /** An error the teacher just added (FE-only) — opens its edit form even once mapped into a block. */
  _new?: boolean;
  error_part?: string;
  correction?: string;
  criterion_code?: string;
  error_type?: string;
  explanation?: string;
};

type RawErr = {
  error_part?: string;
  correction?: string;
  criterion_code?: string;
  error_type?: string;
  explanation?: string;
};
type RawBlock = { errors?: RawErr[] };

let _seq = 0;
const nextId = () => `err-${++_seq}`;

/** Flatten the error blocks into an editable list (tagging the block index so it writes back to the right group). */
export function flattenErrors(blocks: RawBlock[] | undefined): EditErr[] {
  return (blocks ?? []).flatMap((b, bi) => (b.errors ?? []).map((e) => ({ _id: nextId(), bi, ...e })));
}

/** One error added by a teacher — bi<0 by default, optionally prefilled (error_part, seq, bi from a selection).
 * Mark it `_new` so the card opens its edit form even when mapped into an existing block. */
export function blankErr(init?: Partial<EditErr>): EditErr {
  return { _id: nextId(), bi: -1, _new: true, criterion_code: "", error_type: "", error_part: "", correction: "", explanation: "", ...init };
}

export function useEditableErrors(blocks: RawBlock[] | undefined) {
  const [errs, setErrs] = useState<EditErr[]>(() => flattenErrors(blocks));
  const update = (id: string, patch: Partial<EditErr>) =>
    setErrs((prev) => prev.map((e) => (e._id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => setErrs((prev) => prev.filter((e) => e._id !== id));
  // Returns the EditErr just created so the caller can scroll/flash to it. init prefills (e.g. error_part).
  const add = (init?: Partial<EditErr>) => {
    const e = blankErr(init);
    setErrs((prev) => [...prev, e]);
    return e;
  };
  return { errs, update, remove, add };
}

/** Write the edited error list back into the original block structure (keeping block metadata).
 *  New errors (bi < 0) go into the first block. The return type is loose; the caller casts it to the target type. */
export function buildErrorBlocks<T extends RawBlock>(edited: EditErr[], original: T[] | undefined): T[] {
  const base: T[] = original && original.length ? original : ([{}] as unknown as T[]);
  return base.map((block, i) => ({
    ...block,
    errors: edited
      .filter((e) => (e.bi < 0 ? i === 0 : e.bi === i))
      .map((e) => ({
        error_part: e.error_part ?? "",
        criterion_code: e.criterion_code ?? "",
        criterion_name: "",
        error_type: e.error_type ?? "",
        explanation: e.explanation ?? "",
        correction: e.correction ?? "",
      })),
  }));
}

export function EditableErrorList({
  errs,
  codes,
  onAdd,
  onUpdate,
  onRemove,
  readOnly = false,
  hideSource = false,
  onJump,
  label,
}: {
  errs: EditErr[];
  codes: string[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<EditErr>) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
  /** Hide the error-source label (AI / teacher-added) — a student needs not know who found it. */
  hideSource?: boolean;
  /** Clicking an error jumps to its position in the transcript (Speaking). Absent = not clickable. */
  onJump?: (err: EditErr) => void;
  /** Label for the error's position, e.g. "Part 1 · Câu 2". Returning null hides it. */
  label?: (err: EditErr) => string | null;
}) {
  return (
    <div className="space-y-3">
      {errs.length === 0 && (
        <p className="rounded-lg border border-dashed border-ink-200 bg-white px-4 py-6 text-center text-sm text-ink-400">
          {readOnly ? "Không phát hiện lỗi nào." : "Chưa có lỗi nào. Nhấn “Thêm lỗi” để bổ sung."}
        </p>
      )}
      {errs.map((e, i) => (
        <EditErrorCard key={e._id} err={e} index={i} codes={codes} onUpdate={onUpdate} onRemove={onRemove} readOnly={readOnly} hideSource={hideSource} onJump={onJump} label={label?.(e) ?? null} />
      ))}
      {!readOnly && (
        <button
          data-testid="add-error-btn"
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-4 py-2.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
        >
          <Plus className="size-4" /> Thêm lỗi
        </button>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm text-ink-800 outline-none focus:border-brand-400";

function EditErrorCard({
  err,
  index,
  codes,
  onUpdate,
  onRemove,
  readOnly = false,
  hideSource = false,
  onJump,
  label,
}: {
  err: EditErr;
  index: number;
  codes: string[];
  onUpdate: (id: string, patch: Partial<EditErr>) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
  hideSource?: boolean;
  onJump?: (err: EditErr) => void;
  label?: string | null;
}) {
  // An error the teacher just added (_new) — even once mapped into an existing block — opens its edit form.
  const [editing, setEditing] = useState(!readOnly && !!err._new);

  if (editing && !readOnly) {
    return (
      <div id={`err-row-${err._id}`} className="space-y-2.5 rounded-xl border border-brand-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            {label && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold normal-case text-brand-600">{label}</span>}
            {err._new ? "Lỗi giáo viên thêm" : "Sửa lỗi"}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setEditing(false)} aria-label="Xong" className="rounded-md p-1 text-success-700 hover:bg-success-50">
              <Check className="size-4" />
            </button>
            <button type="button" onClick={() => onRemove(err._id)} aria-label="Xoá lỗi" className="rounded-md p-1 text-ink-300 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={err.criterion_code ?? ""} onChange={(e) => onUpdate(err._id, { criterion_code: e.target.value })} className={inputCls}>
            <option value="">Tiêu chí</option>
            {codes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input value={err.error_type ?? ""} onChange={(e) => onUpdate(err._id, { error_type: e.target.value })} placeholder="Loại lỗi" className={inputCls} />
        </div>
        <input value={err.error_part ?? ""} onChange={(e) => onUpdate(err._id, { error_part: e.target.value })} placeholder="Phần sai (vd: I goes)" className={inputCls} />
        <input value={err.correction ?? ""} onChange={(e) => onUpdate(err._id, { correction: e.target.value })} placeholder="Sửa thành (vd: I go)" className={inputCls} />
        <textarea rows={2} value={err.explanation ?? ""} onChange={(e) => onUpdate(err._id, { explanation: e.target.value })} placeholder="Giải thích / nhận xét" className={cn(inputCls, "resize-y leading-6")} />
      </div>
    );
  }

  const canJump = !!onJump;
  return (
    <div
      id={`err-row-${err._id}`}
      data-testid={`error-row-${index}`}
      role={canJump ? "button" : undefined}
      tabIndex={canJump ? 0 : undefined}
      onClick={canJump ? () => onJump!(err) : undefined}
      onKeyDown={canJump ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump!(err); } } : undefined}
      className={cn("rounded-xl border border-ink-100 bg-white p-4", canJump && "cursor-pointer transition-colors hover:border-brand-200")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {label && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">{label}</span>}
          {err.criterion_code && <span className="rounded-full border border-ink-200 px-2 py-0.5 text-xs font-mono text-ink-500">{err.criterion_code}</span>}
          {err.error_type && <span className="text-xs font-medium text-ink-400">{err.error_type}</span>}
          {!hideSource && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", err._new ? "bg-brand-50 text-brand-600" : "bg-ink-100 text-ink-500")}>
              {err._new ? "GV thêm" : "AI"}
            </span>
          )}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }} aria-label="Sửa lỗi" className="rounded-md p-1 text-ink-300 hover:bg-ink-50 hover:text-ink-600">
              <Edit3 className="size-4" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(err._id); }} aria-label="Xoá lỗi" className="rounded-md p-1 text-ink-300 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-ink-700">
        {err.error_part && <span className="text-red-600 line-through">{err.error_part}</span>}
        {err.correction && <span className="mx-2 text-ink-400">→</span>}
        {err.correction && <span className="font-semibold text-emerald-700">{err.correction}</span>}
      </p>
      {err.explanation && <p className="mt-2 text-sm leading-relaxed text-ink-600">{err.explanation}</p>}
    </div>
  );
}
