"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AnswerSpanMark } from "./answer-span-mark";

type AnswerSpansConfig = { numbers: number[] };

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  answerSpans?: AnswerSpansConfig;
};

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = 160,
  answerSpans,
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      ...(answerSpans ? [AnswerSpanMark] : []),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none px-4 py-3 focus:outline-none [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className={cn("rounded-lg border border-input bg-white", className)}>
      <Toolbar editor={editor} answerSpans={answerSpans} />
      <div style={{ minHeight }} className="cursor-text" onClick={() => editor.commands.focus()}>
        <EditorContent
          editor={editor}
          placeholder={placeholder}
          className="text-sm leading-relaxed text-ink-900"
        />
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  answerSpans,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  answerSpans?: AnswerSpansConfig;
}) {
  const btn = (active: boolean) =>
    cn(
      "h-7 min-w-7 rounded px-2 text-xs font-semibold transition-colors",
      active ? "bg-brand-100 text-brand-700" : "text-ink-600 hover:bg-ink-100",
    );

  const sortedNumbers = answerSpans
    ? Array.from(new Set(answerSpans.numbers)).sort((a, b) => a - b)
    : [];

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-input px-2 py-1.5">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))}>
        <b>B</b>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))}>
        <i>I</i>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))}>
        <s>S</s>
      </button>
      <span className="mx-1 h-4 w-px bg-input" />
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))}>
        • List
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))}>
        1. List
      </button>
      <span className="mx-1 h-4 w-px bg-input" />
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btn(editor.isActive({ textAlign: "left" }))}>
        ⟸
      </button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btn(editor.isActive({ textAlign: "center" }))}>
        ⇔
      </button>
      <button type="button" onClick={() => editor.chain().focus().setTextAlign("justify").run()} className={btn(editor.isActive({ textAlign: "justify" }))}>
        ☰
      </button>
      <span className="mx-1 h-4 w-px bg-input" />
      <button type="button" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} className={btn(false)}>
        Clear
      </button>
      {answerSpans ? (
        <>
          <span className="mx-1 h-4 w-px bg-input" />
          <AnswerSpanCluster editor={editor} numbers={sortedNumbers} btn={btn} />
        </>
      ) : null}
    </div>
  );
}

function AnswerSpanCluster({
  editor,
  numbers,
  btn,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  numbers: number[];
  btn: (active: boolean) => string;
}) {
  const [selected, setSelected] = useState<number | undefined>(numbers[0]);

  useEffect(() => {
    if (selected != null && numbers.includes(selected)) return;
    setSelected(numbers[0]);
  }, [numbers, selected]);

  const disabled = numbers.length === 0 || selected == null;

  return (
    <div className="flex items-center gap-1">
      <label className="flex items-center gap-1 text-xs text-ink-600">
        Câu
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : undefined)}
          disabled={numbers.length === 0}
          className="h-7 rounded border border-input bg-white px-1 text-xs text-ink-900 disabled:bg-ink-100 disabled:text-ink-400"
        >
          {numbers.length === 0 ? (
            <option value="">--</option>
          ) : (
            numbers.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))
          )}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (selected == null) return;
          editor.chain().focus().setAnswerSpan(selected).run();
        }}
        className={cn(btn(false), "disabled:cursor-not-allowed disabled:opacity-40")}
      >
        Đánh dấu đáp án
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => editor.chain().focus().unsetAnswerSpan().run()}
        className={cn(btn(false), "disabled:cursor-not-allowed disabled:opacity-40")}
      >
        Bỏ đánh dấu
      </button>
    </div>
  );
}
