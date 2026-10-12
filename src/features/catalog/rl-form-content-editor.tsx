"use client";

// Tiptap WYSIWYG editor for the R/L "form completion" content body
// (`group.content_html`): tables + inline blanks (`<span data-blank="N">`)
// authored directly, with a raw-HTML escape hatch for structures the WYSIWYG
// can't represent losslessly. Mirrors components/ui/rich-text-editor.tsx for
// toolbar styling/structure; see blank-node.ts + rl-form-html.ts for the
// storage contract this editor writes to.

import { Editor, type Editor as EditorInstance } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BlankNode } from "@/components/ui/blank-node";
import { blankNumbersFromHtml, normalizeContentHtml, reconcileItems } from "./rl-form-html";
import { nextNumberFrom } from "./rl-metadata";
import type { RLGroupDraft } from "./types";

const EDITOR_EXTENSIONS = [StarterKit, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell, BlankNode];

/** Collapse-whitespace, tag-stripped text content — used by the mount probe to compare round-trips. */
function textOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Decide whether the editor should start in raw-HTML mode: true when the
 * initial content does NOT round-trip losslessly through the WYSIWYG editor
 * (blank set or text content would diverge), so the author sees the raw
 * markup instead of a silently-lossy WYSIWYG render. Builds and always
 * destroys a throwaway headless editor to probe the round-trip.
 */
function shouldStartRaw(html: string | undefined): boolean {
  if (typeof window === "undefined") return false;
  if (!html || html.trim() === "") return false;

  const probe = new Editor({ extensions: EDITOR_EXTENSIONS, content: html });
  try {
    const out = probe.getHTML();
    const blanksMatch = arraysEqual(blankNumbersFromHtml(html), blankNumbersFromHtml(out));
    const textMatches = textOf(html) === textOf(out);
    return !(blanksMatch && textMatches);
  } finally {
    probe.destroy();
  }
}

export function RLFormContentEditor(props: {
  group: RLGroupDraft;
  existingNumbers: number[];
  onChange: (g: RLGroupDraft) => void;
}) {
  const { group, existingNumbers, onChange } = props;

  const [rawMode, setRawMode] = useState<boolean>(() => shouldStartRaw(group.content_html));

  // Tiptap v3 binds `onUpdate` ONCE (constructor), freezing the first-render
  // closure — so `commit` must NOT read `group`/`onChange` directly or it would
  // reconcile against the mount-time snapshot and clobber later edits to items
  // (answer keys) and sibling fields (title/rubric). Route through refs that
  // always point at the latest props. (A `deps` array on useEditor would instead
  // recreate the editor and thrash the caret — not acceptable.)
  const groupRef = useRef(group);
  groupRef.current = group;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commit = (html: string) => {
    const g = groupRef.current;
    onChangeRef.current({
      ...g,
      content_html: normalizeContentHtml(html),
      items: reconcileItems(g.items, blankNumbersFromHtml(html)),
    });
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: EDITOR_EXTENSIONS,
    content: group.content_html ?? "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-4 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => commit(editor.getHTML()),
  });

  if (rawMode) {
    return (
      <div className="rounded-lg border border-input bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-input px-3 py-1.5">
          <p className="text-xs text-amber-700">
            Chế độ HTML thô (nâng cao) — nội dung không thể hiển thị đầy đủ ở chế độ soạn thảo trực quan.
          </p>
          <button
            type="button"
            onClick={() => {
              editor?.commands.setContent(group.content_html ?? "", { emitUpdate: false });
              setRawMode(false);
            }}
            className="h-7 shrink-0 rounded px-2 text-xs font-semibold text-ink-600 hover:bg-ink-100"
          >
            Về WYSIWYG
          </button>
        </div>
        <textarea
          className="min-h-40 w-full resize-y px-4 py-3 font-mono text-xs text-ink-900 outline-none"
          value={group.content_html ?? ""}
          onChange={(e) => commit(e.target.value)}
        />
      </div>
    );
  }

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-input bg-white">
      <Toolbar editor={editor} existingNumbers={existingNumbers} onSwitchToRaw={() => setRawMode(true)} />
      <EditorContent editor={editor} className="text-sm leading-relaxed text-ink-900" />
    </div>
  );
}

function Toolbar({
  editor,
  existingNumbers,
  onSwitchToRaw,
}: {
  editor: EditorInstance;
  existingNumbers: number[];
  onSwitchToRaw: () => void;
}) {
  const btn = (active: boolean) =>
    cn(
      "h-7 min-w-7 rounded px-2 text-xs font-semibold transition-colors",
      active ? "bg-brand-100 text-brand-700" : "text-ink-600 hover:bg-ink-100",
    );

  const insertBlank = () => {
    const n = nextNumberFrom([...existingNumbers, ...blankNumbersFromHtml(editor.getHTML())]);
    editor.chain().focus().insertBlank(n).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-input px-2 py-1.5">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive("bold"))}
      >
        <b>B</b>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive("italic"))}
      >
        <i>I</i>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive("bulletList"))}
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive("orderedList"))}
      >
        1. List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btn(editor.isActive("heading", { level: 3 }))}
      >
        H3
      </button>
      <span className="mx-1 h-4 w-px bg-input" />
      <button
        type="button"
        onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()}
        className={btn(false)}
      >
        Bảng
      </button>
      <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className={btn(false)}>
        Thêm hàng
      </button>
      <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className={btn(false)}>
        Xoá hàng
      </button>
      <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className={btn(false)}>
        Thêm cột
      </button>
      <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className={btn(false)}>
        Xoá cột
      </button>
      <button type="button" onClick={() => editor.chain().focus().deleteTable().run()} className={btn(false)}>
        Xoá bảng
      </button>
      <span className="mx-1 h-4 w-px bg-input" />
      <button type="button" onClick={insertBlank} className={btn(false)}>
        Chèn ô trống
      </button>
      <span className="mx-1 h-4 w-px bg-input" />
      <button type="button" onClick={onSwitchToRaw} className={btn(false)}>
        {"</> HTML thô"}
      </button>
    </div>
  );
}
