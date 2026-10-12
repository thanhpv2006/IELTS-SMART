/**
 * Behavior tests for RLFormContentEditor.
 *
 * The Tiptap `EditorContent` (WYSIWYG) path relies on ProseMirror DOM APIs
 * that jsdom only partially implements, so it's covered with a single mount
 * smoke check (case 1). The real behavioral assertions (GC4 reconcile, GC3
 * empty-normalize) run against the raw-`<textarea>` escape-hatch path, which
 * is deterministic in jsdom — entered via the real "</> HTML thô" toggle
 * button rather than by forcing a non-round-tripping mount, so the toggle
 * itself is exercised too.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RLFormContentEditor } from "./rl-form-content-editor";
import type { RLGroupDraft } from "./types";

const ONE_BLANK_HTML =
  '<table><tbody><tr><td>Fee</td><td><span data-blank="1"></span></td></tr></tbody></table>';

function baseGroup(): RLGroupDraft {
  return {
    type: "gap_fill",
    items: [{ number: 1, answer_key: ["x"] }],
    content_html: ONE_BLANK_HTML,
  };
}

describe("RLFormContentEditor — WYSIWYG mount (smoke)", () => {
  it("mounts without throwing and shows the toolbar for a round-tripping table", async () => {
    const onChange = vi.fn();
    render(<RLFormContentEditor group={baseGroup()} existingNumbers={[1]} onChange={onChange} />);

    expect(await screen.findByText("Chèn ô trống")).toBeTruthy();
  });
});

describe("RLFormContentEditor — raw escape-hatch path", () => {
  it("GC4: editing raw html to add a second blank reconciles items to match", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RLFormContentEditor group={baseGroup()} existingNumbers={[1]} onChange={onChange} />);

    await user.click(await screen.findByText("</> HTML thô"));

    const textarea = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    const twoBlankHtml =
      '<table><tbody><tr><td>Fee</td><td><span data-blank="1"></span></td></tr>' +
      '<tr><td>Date</td><td><span data-blank="2"></span></td></tr></tbody></table>';
    fireEvent.change(textarea, { target: { value: twoBlankHtml } });

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RLGroupDraft;
    expect(last.items).toHaveLength(2);
    expect(last.items.map((it) => it.number).sort()).toEqual([1, 2]);
    expect(last.content_html).toContain('data-blank="2"');
  });

  it("GC3: clearing the raw html normalizes content_html to undefined and items to []", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RLFormContentEditor group={baseGroup()} existingNumbers={[1]} onChange={onChange} />);

    await user.click(await screen.findByText("</> HTML thô"));

    const textarea = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "" } });

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RLGroupDraft;
    expect(last.content_html).toBeUndefined();
    expect(last.items).toEqual([]);
  });
});
