/**
 * Behavior tests for the RLGroupEditor form-mode toggle (gap_fill only).
 * Covers: builder rendering for an already-valid form, create-new from empty
 * html, the unparseable-html fallback (rich rubric editor + form-content
 * editor, no data loss), hiding "Thêm câu" / RLItemRow "Xoá" while form mode
 * is on, and the ON→OFF toggle preserving instructions_html + the item list.
 *
 * The complex (raw 3-field) path renders `RichTextEditor` (rubric) and
 * `RLFormContentEditor` (form body) — both Tiptap-backed and noisy/
 * non-deterministic in jsdom, so they're mocked to lightweight sentinels
 * (see `vi.mock` calls below); their presence proves which branch rendered.
 *
 * Note: the "Hướng dẫn" label in the *non-form* branch is a sibling of a
 * plain textarea (no htmlFor/id), so that textarea is queried via
 * `container.querySelector("textarea")` rather than `getByLabelText` (it's
 * the only <textarea> the editor renders in that branch).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RLGroupEditor } from "./rl-group-editor";
import type { RLGroupDraft } from "./types";

// Tiptap contentEditable is noisy/non-deterministic in jsdom — the complex
// (raw 3-field) path now wires the rubric + form content through these rich
// editors, so replace them with lightweight sentinels. Their mere presence
// (and, for the rubric, the value passed in) is enough to prove which branch
// of RLGroupEditor rendered; RLFormBuilder is intentionally left unmocked
// since the "simple form" tests below assert its real DOM (rows, buttons).
vi.mock("./rl-form-content-editor", () => ({
  RLFormContentEditor: () => <div data-testid="rl-form-content-editor" />,
}));
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: (props: { value: string }) => (
    <div data-testid="rich-text-editor">{props.value}</div>
  ),
}));

const FORM_HTML =
  "<table><tbody>" +
  '<tr><td>First name</td><td><span data-blank="1"></span></td></tr>' +
  "<tr><td>Family name</td><td>Yuichini</td></tr>" +
  "</tbody></table>";

// Not builder-eligible (parseForm rejects: a leading <div> is neither <p> nor
// <h3>, so bodyChildren[0] isn't the table `resolveModel` expects).
const COMPLEX_FORM_CONTENT_HTML =
  "<div>Complete the form below.</div><table><tbody>" +
  '<tr><td>First name</td><td><span data-blank="1"></span></td></tr>' +
  "</tbody></table>";

function renderEditor(group: RLGroupDraft) {
  const onChange = vi.fn();
  const onRemove = vi.fn();
  const utils = render(
    <RLGroupEditor
      group={group}
      existingNumbers={group.items.map((it) => it.number)}
      onChange={onChange}
      onRemove={onRemove}
    />,
  );
  return { ...utils, onChange, onRemove };
}

describe("RLGroupEditor — form mode (gap_fill)", () => {
  it("renders the builder for a valid form and checks the toggle", () => {
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "First name", answer_key: [] }],
      instructions_html: FORM_HTML,
    };
    renderEditor(group);

    // `@testing-library/jest-dom` matchers (e.g. `toBeChecked`) are only
    // typed for files under tests/unit/ (setup.ts import), which tsconfig
    // excludes from src/'s program — assert the native DOM property instead
    // so this file type-checks under `tsc -p tsconfig.json`.
    expect((screen.getByLabelText("Soạn dạng form (bảng)") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Thêm dòng" })).toBeTruthy();
    // Builder mode is active → the raw instructions_html is parsed into rows,
    // not exposed in an editable textarea. (Query by value rather than tag: the
    // item-row "Giải thích" field is also a <textarea> but never holds the html.)
    expect(screen.queryByDisplayValue(FORM_HTML)).toBeNull();
  });

  it("renders a create-new builder when html is empty and the toggle is turned on", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [],
      instructions_html: "",
    };
    renderEditor(group);

    expect(screen.queryByRole("button", { name: "Thêm dòng" })).toBeNull();
    await user.click(screen.getByLabelText("Soạn dạng form (bảng)"));

    expect(screen.getByRole("button", { name: "Thêm dòng" })).toBeTruthy();
  });

  it("falls back to the rich rubric + form-content editors for unparseable html, without losing content", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "", answer_key: [] }],
      instructions_html: "<div>x</div>",
    };
    renderEditor(group);

    await user.click(screen.getByLabelText("Soạn dạng form (bảng)"));

    // Complex (non-builder-eligible) path: rubric goes through RichTextEditor
    // (content preserved, not dropped) and the form content through
    // RLFormContentEditor — both mocked to sentinels above.
    expect(screen.getByTestId("rich-text-editor").textContent).toBe("<div>x</div>");
    expect(screen.getByTestId("rl-form-content-editor")).toBeTruthy();
  });

  it("hides 'Thêm câu' and RLItemRow's 'Xoá' button while form mode is on", () => {
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "First name", answer_key: [] }],
      instructions_html: FORM_HTML,
    };
    renderEditor(group);

    expect(screen.queryByRole("button", { name: "Thêm câu" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xoá câu" })).toBeNull();
  });

  it("hides the redundant 'Câu hỏi / mệnh đề' prompt input in form mode but shows it when off", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "First name", answer_key: [] }],
      instructions_html: FORM_HTML,
    };
    renderEditor(group);

    // Form mode starts ON: the item-row prompt input (authored via the form
    // builder's label) must not be shown as an editable field.
    expect(screen.queryByText("Câu hỏi / mệnh đề")).toBeNull();

    // Turn form mode OFF → the classic prompt input reappears.
    await user.click(screen.getByLabelText("Soạn dạng form (bảng)"));
    expect(screen.getByText("Câu hỏi / mệnh đề")).toBeTruthy();
  });

  it("ON→OFF: unchecking preserves instructions_html in the textarea and leaves the item list unchanged", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [
        { number: 1, prompt: "First name", answer_key: [] },
        { number: 2, prompt: "Family name", answer_key: ["Yuichini"] },
      ],
      instructions_html: FORM_HTML,
    };
    const { container } = renderEditor(group);

    // form mode starts ON (hasFormBlanks(FORM_HTML) === true) — turn it OFF.
    await user.click(screen.getByLabelText("Soạn dạng form (bảng)"));

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe(FORM_HTML);

    expect(screen.getByTestId("rl-item-1")).toBeTruthy();
    expect(screen.getByTestId("rl-item-2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thêm dòng" })).toBeNull();
  });

  it("strips the form-table instructions_html when switching type off gap_fill", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "First name", answer_key: [] }],
      instructions_html: FORM_HTML,
    };
    const { onChange } = renderEditor(group);

    await user.selectOptions(screen.getByLabelText("Loại nhóm câu hỏi"), "mcq_single");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "mcq_single", instructions_html: undefined }),
    );
  });

  it("drops select_count when switching type off mcq_multi", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "mcq_multi",
      select_count: 2,
      shared_options: ["A. one", "B. two"],
      items: [{ number: 1, prompt: "Which TWO?", answer_key: ["A", "B"] }],
    };
    const { onChange } = renderEditor(group);

    await user.selectOptions(screen.getByLabelText("Loại nhóm câu hỏi"), "mcq_single");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: "mcq_single", select_count: undefined }));
  });
});

// The 3-field raw editor's labels are plain sibling <label> elements (no
// htmlFor/id), same limitation noted for the "Hướng dẫn" textarea at the top
// of this file — so fields are resolved via the label's sibling control
// rather than `getByLabelText`.
function controlAfterLabel(labelText: string, tag: "input" | "textarea") {
  const label = screen.getByText(labelText);
  return label.parentElement?.querySelector(tag) as HTMLInputElement | HTMLTextAreaElement;
}

describe("RLGroupEditor — raw 3-field path (content_html present)", () => {
  it("renders the 3-field raw form editor (rich rubric + form-content editors) when content_html is unparseable, and 'Đề mục' input reports title edits", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "First name", answer_key: [] }],
      title: "Questions 1–5",
      instructions_html: "Write NO MORE THAN TWO WORDS for each answer.",
      content_html: COMPLEX_FORM_CONTENT_HTML,
    };
    const { onChange } = renderEditor(group);

    expect(screen.getByText("Đề mục (vd: Questions 1–7)")).toBeTruthy();
    expect(screen.getByText("Hướng dẫn (rubric)")).toBeTruthy();
    expect(screen.getByText("Nội dung form (bảng + ô trống)")).toBeTruthy();
    // Rubric is now a RichTextEditor (mocked sentinel) carrying instructions_html,
    // and the form body is a RLFormContentEditor (mocked sentinel) — no data lost.
    expect(screen.getByTestId("rich-text-editor").textContent).toBe(
      "Write NO MORE THAN TWO WORDS for each answer.",
    );
    expect(screen.getByTestId("rl-form-content-editor")).toBeTruthy();

    const titleInput = controlAfterLabel("Đề mục (vd: Questions 1–7)", "input");
    expect(titleInput.value).toBe("Questions 1–5");

    await user.type(titleInput, "!");

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Questions 1–5!" }),
    );
  });

  it("renders only the single 'Hướng dẫn' textarea for a non-form gap_fill group (no data-blank anywhere)", () => {
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "", answer_key: [] }],
      instructions_html: "Complete the sentences below.",
    };
    renderEditor(group);

    expect(screen.getByText("Hướng dẫn (vd: Questions 1–4, Write ONE WORD…)")).toBeTruthy();
    expect(screen.queryByText("Đề mục (vd: Questions 1–7)")).toBeNull();
    expect(screen.queryByText("Nội dung form (bảng + ô trống)")).toBeNull();
    expect(screen.queryByTestId("rl-form-row-0")).toBeNull();
  });

  it("C1 regression: content_html present with a SIMPLE (otherwise-builder-eligible) form still renders the raw 3-field path, not RLFormBuilder", () => {
    // FORM_HTML is exactly the shape that IS builder-eligible when it lives in
    // instructions_html (see the "form mode" describe block above) — here it's
    // parked in content_html instead, which must force the raw path regardless.
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [
        { number: 1, prompt: "First name", answer_key: [] },
        { number: 2, prompt: "Family name", answer_key: ["Yuichini"] },
      ],
      title: "Questions 1–2",
      instructions_html: "Write ONE WORD for each answer.",
      content_html: FORM_HTML,
    };
    renderEditor(group);

    // Builder-only affordances must be absent.
    expect(screen.queryByRole("button", { name: "Thêm dòng" })).toBeNull();
    expect(screen.queryByTestId("rl-form-row-0")).toBeNull();
    expect(screen.queryByLabelText("Nhãn")).toBeNull();

    // The raw 3-field path is what's actually rendered — RLFormContentEditor
    // (mocked sentinel) owns content_html now, so its presence is proof this
    // is the complex path and not RLFormBuilder.
    expect(screen.getByText("Đề mục (vd: Questions 1–7)")).toBeTruthy();
    expect(screen.getByText("Nội dung form (bảng + ô trống)")).toBeTruthy();
    expect(screen.getByTestId("rl-form-content-editor")).toBeTruthy();
  });
});
