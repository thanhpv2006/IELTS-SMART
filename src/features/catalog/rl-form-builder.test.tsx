/**
 * Behavior tests for the RLFormBuilder form-row editor.
 * Covers: adding a blank row emits the canonical <span data-blank="N"> +
 * reconciled item, rendering an existing 2-row form, and the D6 seed-from-items
 * guard (opening the builder on a group with empty html + real items must not
 * wipe those items on the first commit).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RLFormBuilder } from "./rl-form-builder";
import type { RLGroupDraft } from "./types";

describe("RLFormBuilder — add a blank row", () => {
  it("adding a row and switching it to 'Ô trống' emits a canonical blank span + reconciled item", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = { type: "gap_fill", items: [], instructions_html: undefined };
    const onChange = vi.fn();

    render(<RLFormBuilder group={group} existingNumbers={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Thêm dòng" }));
    await user.click(screen.getByRole("radio", { name: "Ô trống" }));

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RLGroupDraft;
    expect(last.instructions_html).toContain('<span data-blank="1">');
    expect(last.items).toContainEqual(expect.objectContaining({ number: 1 }));
  });
});

describe("RLFormBuilder — renders an existing form", () => {
  it("renders both a blank row and a given row from persisted instructions_html", () => {
    const html =
      '<table><tbody>' +
      '<tr><td>First name</td><td><span data-blank="1"></span></td></tr>' +
      '<tr><td>Family name</td><td>Yuichini</td></tr>' +
      '</tbody></table>';
    const group: RLGroupDraft = {
      type: "gap_fill",
      items: [{ number: 1, prompt: "First name", answer_key: [] }],
      instructions_html: html,
    };
    const onChange = vi.fn();

    render(<RLFormBuilder group={group} existingNumbers={[1]} onChange={onChange} />);

    expect(screen.getByDisplayValue("First name")).toBeTruthy();
    expect(screen.getByDisplayValue("Family name")).toBeTruthy();
    expect(screen.getByDisplayValue("Yuichini")).toBeTruthy();
    expect(screen.getByText("Câu 1")).toBeTruthy();
  });
});

describe("RLFormBuilder — D6 seed-from-items guard", () => {
  it("seeds blank rows from items when html is empty and never wipes them on commit", async () => {
    const user = userEvent.setup();
    const group: RLGroupDraft = {
      type: "gap_fill",
      instructions_html: "",
      items: [
        { number: 1, prompt: "First name", answer_key: ["Kenji"] },
        { number: 2, prompt: "Passport", answer_key: ["X"] },
      ],
    };
    const onChange = vi.fn();

    render(<RLFormBuilder group={group} existingNumbers={[1, 2]} onChange={onChange} />);

    // Seeded from items: 2 blank rows, labelled by prompt.
    expect(screen.getByDisplayValue("First name")).toBeTruthy();
    expect(screen.getByDisplayValue("Passport")).toBeTruthy();
    expect(screen.getByText("Câu 1")).toBeTruthy();
    expect(screen.getByText("Câu 2")).toBeTruthy();

    // Trigger a commit via an unrelated edit (instruction field).
    await user.type(screen.getByLabelText("Hướng dẫn"), "x");

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as RLGroupDraft;
    expect(last.items).toContainEqual(
      expect.objectContaining({ number: 1, answer_key: ["Kenji"] }),
    );
    expect(last.items).toContainEqual(
      expect.objectContaining({ number: 2, answer_key: ["X"] }),
    );
  });
});
