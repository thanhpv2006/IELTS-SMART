"use client";

// Renders one skill's questions inside the unified set editor: list + author/edit/remove/
// reorder + (full_test only) import from exam. Question-first — "Thêm câu hỏi" opens the
// skill's own editor, and only attaches the question to the set once it's saved/published.

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { useSetItems } from "./use-set-items";
import type { CatalogQuestion, CatalogSetKind, CatalogSkill } from "./types";
import { capFor, partLabel } from "./types";
import { QuestionEditor } from "./question-editor";
import { RLQuestionEditor } from "./rl-question-editor";
import { QuestionPreviewDialog } from "./question-preview-dialog";
import { SetPreviewButtons } from "./set-preview-buttons";
import { errorMessage } from "@/lib/api/errors";
import { stripHtml } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PREVIEW_LEN = 90;

function preview(prompt: string): string {
  const text = stripHtml(prompt).replace(/\n/g, " ");
  return text.length > PREVIEW_LEN ? `${text.slice(0, PREVIEW_LEN)}…` : text;
}

interface SkillItemsPanelProps {
  kind: CatalogSetKind;
  skill: CatalogSkill;
  allItems: CatalogQuestion[];
  hook: ReturnType<typeof useSetItems>;
  readOnly?: boolean;
}

export function SkillItemsPanel({ kind, skill, allItems, hook, readOnly = false }: SkillItemsPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogQuestion | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const slice = allItems.filter((q) => q.skill === skill);
  // A single-skill set is one Part, so the first question fixes it: the cap shown and the Part
  // offered to the next question both follow from it. full_test spans every Part, so it has none.
  const setPart = kind === "full_test" ? undefined : slice[0]?.part;
  const cap = capFor(kind, skill, setPart);
  const overCap = cap != null && slice.length > cap;

  // setItems replaces the whole ordered list, so overlapping mutations that each read a stale
  // `allItems` snapshot would lost-update. Serialize by ignoring actions while one is in flight.
  const runAction = async (action: () => Promise<void>) => {
    if (pending) return;
    setActionError(null);
    setPending(true);
    try {
      await action();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const handleRemove = (id: string) => runAction(() => hook.removeItem(id));

  // Move the question at position `i` in `slice` up/down among questions of THIS skill only —
  // find the adjacent same-skill question, then swap their two ids inside the FULL ordered
  // list (allItems) so other skills' relative order is untouched.
  const handleMove = (i: number, dir: -1 | 1) => {
    const target = slice[i + dir];
    if (!target) return;
    const current = slice[i];
    const nextOrderedIds = allItems.map((q) => q.id);
    const idxA = nextOrderedIds.indexOf(current.id);
    const idxB = nextOrderedIds.indexOf(target.id);
    [nextOrderedIds[idxA], nextOrderedIds[idxB]] = [nextOrderedIds[idxB], nextOrderedIds[idxA]];
    runAction(() => hook.reorder(nextOrderedIds));
  };

  const editorSaved = async (id?: string) => {
    if (id) {
      await runAction(() => hook.attachNew(id));
    } else {
      await runAction(() => hook.updateDone());
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-700">
            {slice.length}
            {cap != null ? `/${cap}` : ""} câu
          </span>
          {overCap && <Badge tone="warning">Vượt gợi ý</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={slice.length === 0}
            onClick={() => setPreviewOpen(true)}
          >
            Xem câu hỏi
          </Button>
          <SetPreviewButtons skill={skill} questions={slice} />
          {!readOnly && (
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              Thêm câu hỏi
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{actionError}</p>
      )}

      {slice.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-200 px-3 py-4 text-center text-sm text-ink-400">
          Chưa có câu hỏi nào.
        </p>
      ) : (
        <ul className="space-y-2">
          {slice.map((q, i) => (
            <li
              key={q.id}
              className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
            >
              <span className="w-6 shrink-0 text-center font-medium text-ink-500">{i + 1}</span>
              <span className="shrink-0 rounded-md bg-ink-100 px-1.5 py-0.5 text-xs font-medium text-ink-600">
                {partLabel(q.skill, q.part)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-800">{preview(q.prompt)}</span>
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={i === 0 || pending}
                    onClick={() => handleMove(i, -1)}
                    aria-label="Di chuyển lên"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={i === slice.length - 1 || pending}
                    onClick={() => handleMove(i, 1)}
                    aria-label="Di chuyển xuống"
                  >
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(q)}>
                    Sửa
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    className="border-red-200 text-red-500 hover:bg-red-50"
                    onClick={() => handleRemove(q.id)}
                  >
                    Xoá
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {(skill === "speaking" || skill === "writing") && (
        <QuestionEditor
          open={addOpen}
          onClose={() => setAddOpen(false)}
          lockedSkill={skill}
          lockedPart={setPart}
          onSaved={editorSaved}
        />
      )}
      {(skill === "reading" || skill === "listening") && (
        <RLQuestionEditor open={addOpen} onClose={() => setAddOpen(false)} skill={skill} onSaved={editorSaved} />
      )}

      {editing &&
        (editing.skill === "speaking" || editing.skill === "writing" ? (
          <QuestionEditor
            open={!!editing}
            onClose={() => setEditing(null)}
            question={editing}
            onSaved={editorSaved}
          />
        ) : (
          <RLQuestionEditor
            open={!!editing}
            onClose={() => setEditing(null)}
            skill={editing.skill as "reading" | "listening"}
            question={editing}
            onSaved={editorSaved}
          />
        ))}

      

      <QuestionPreviewDialog
        skill={skill}
        questions={slice}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
