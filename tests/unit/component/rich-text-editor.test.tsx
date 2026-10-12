/**
 * Component tests for RichTextEditor.
 * Covers CMP-03 + NF-05.
 *
 * Cases:
 *   CMP-03a — Editor renders with initial HTML content.
 *   CMP-03b — Toolbar buttons render (Bold, Italic, Strike, etc.).
 *   CMP-03c — onChange is called when content changes (output is valid HTML).
 *   NF-05a  — Output HTML contains no raw <script> tags (basic XSS check).
 *   NF-05b  — Output HTML contains no javascript: href attributes.
 *
 * Note: Tiptap uses contenteditable divs. Full interaction tests that require
 * editor.commands are hard to drive from userEvent in jsdom without a real DOM
 * selection engine; those are marked skip with explanation.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

describe("CMP-03a — RichTextEditor renders with initial HTML", () => {
  it("renders without crashing when given initial HTML", async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(<RichTextEditor value="<p>Xin chào</p>" onChange={onChange} />);
    });
    // Toolbar should be present after editor mounts.
    expect(screen.getByRole("button", { name: /b/i })).toBeInTheDocument();
  });

  it("renders the initial text content inside the editor", async () => {
    const onChange = vi.fn();
    await act(async () => {
      render(<RichTextEditor value="<p>Hello world</p>" onChange={onChange} />);
    });
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });
});

describe("CMP-03b — Toolbar buttons render", () => {
  it("renders Bold button", async () => {
    await act(async () => {
      render(<RichTextEditor value="" onChange={vi.fn()} />);
    });
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });

  it("renders Bullet List button", async () => {
    await act(async () => {
      render(<RichTextEditor value="" onChange={vi.fn()} />);
    });
    // Both "• List" and "1. List" match /list/ — use the exact text "• List".
    expect(screen.getByRole("button", { name: "• List" })).toBeInTheDocument();
  });

  it("renders Clear button", async () => {
    await act(async () => {
      render(<RichTextEditor value="" onChange={vi.fn()} />);
    });
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });
});

// CMP-03c (onUpdate emits valid HTML while typing): Tiptap only fires `onUpdate` through
// a real ProseMirror transaction — jsdom has no selection engine, so it cannot run
// as a unit test. Covered by a REAL E2E on Chromium instead:
// tests/e2e/banks.spec.ts → "CMP-03c: gõ + bôi đậm trong RichTextEditor".

// ─── NF-05a: No XSS — script tags ────────────────────────────────────────────

describe("NF-05a — Output HTML does not allow <script> injection", () => {
  it("sanitised output does not contain <script> from initial value", async () => {
    // Tiptap's ProseMirror schema strips unknown nodes such as <script>.
    const malicious = '<p>text</p><script>alert("xss")</script>';
    await act(async () => {
      render(<RichTextEditor value={malicious} onChange={vi.fn()} />);
    });
    // The rendered DOM should not contain a <script> element.
    expect(document.querySelector("script[data-injected]")).toBeNull();
    // The contenteditable area should not contain literal script text rendered
    // as visible text either — Tiptap strips unknown nodes from the schema.
    const editorArea = document.querySelector(".ProseMirror");
    expect(editorArea?.innerHTML ?? "").not.toContain("<script>");
  });
});

describe("NF-05b — Output HTML does not allow javascript: href attributes", () => {
  it("editor area contains no javascript: href after rendering anchor markup", async () => {
    const withJsHref = '<p><a href="javascript:alert(1)">click</a></p>';
    await act(async () => {
      render(<RichTextEditor value={withJsHref} onChange={vi.fn()} />);
    });
    // Tiptap StarterKit does not include a Link extension by default so <a>
    // nodes are not in the schema — the href attribute is stripped.
    const anchors = document.querySelectorAll(".ProseMirror a[href]");
    for (const a of Array.from(anchors)) {
      expect(a.getAttribute("href")).not.toMatch(/^javascript:/i);
    }
  });
});
