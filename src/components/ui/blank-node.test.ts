/**
 * Round-trip tests for BlankNode against a real headless Tiptap Editor
 * (no React) — locks down the storage contract shared with the exam-engine
 * renderer and the backend blank-count validator:
 *  - parse `<span data-blank="N"></span>` -> serialize back to an EMPTY span
 *  - `insertBlank(n)` command inserts a blank that serializes correctly
 *  - malformed `data-blank` values are rejected to null (fail-closed), never
 *    round-tripping as `data-blank="NaN"`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { BlankNode } from "./blank-node";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("BlankNode — round-trip via headless Editor", () => {
  it("parses a data-blank span and serializes it back as an empty span", () => {
    editor = new Editor({
      extensions: [StarterKit, BlankNode],
      content: '<p><span data-blank="7"></span></p>',
    });

    const html = editor.getHTML();
    expect(html).toContain('data-blank="7"');
    // The serialized span must be empty — the node view's visible number
    // chip text must never leak into storage.
    expect(html).toContain('<span data-blank="7"></span>');
  });

  it("insertBlank(n) inserts a blank that serializes with the given number", () => {
    editor = new Editor({
      extensions: [StarterKit, BlankNode],
      content: "",
    });

    editor.chain().insertBlank(4).run();

    const html = editor.getHTML();
    expect(html).toContain('data-blank="4"');
  });

  it("fail-closed: rejects a non-numeric data-blank value instead of round-tripping NaN", () => {
    editor = new Editor({
      extensions: [StarterKit, BlankNode],
      content: '<p><span data-blank="abc"></span></p>',
    });

    const html = editor.getHTML();
    expect(html).not.toContain('data-blank="NaN"');
  });
});
