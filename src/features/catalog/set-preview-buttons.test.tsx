import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

// The overlay mounts the exam engine; this suite only cares which mode the buttons request.
vi.mock("@/features/preview/skill-preview-overlay", () => ({
  SkillPreviewOverlay: ({ mode, skill }: { mode: string; skill: string }) => (
    <div data-testid="preview-overlay" data-mode={mode} data-skill={skill} />
  ),
}));

import { SetPreviewButtons } from "./set-preview-buttons";
import type { CatalogQuestion, CatalogSkill } from "./types";

function question(skill: CatalogSkill): CatalogQuestion {
  return {
    id: "q-1",
    skill,
    part: 1,
    prompt: "<p>P</p>",
    metadata: {},
    status: "published",
    owner_kind: "partner",
    created_at: "",
    updated_at: "",
  };
}

describe("SetPreviewButtons", () => {
  it("offers both previews for an objective skill", () => {
    render(<SetPreviewButtons skill="reading" questions={[question("reading")]} />);

    expect(screen.getByTestId("set-preview-exam")).toBeEnabled();
    expect(screen.getByTestId("set-preview-result")).toBeEnabled();
  });

  it("hides the answer-key preview on a skill that has no answer key", () => {
    render(<SetPreviewButtons skill="speaking" questions={[question("speaking")]} />);

    expect(screen.getByTestId("set-preview-exam")).toBeInTheDocument();
    expect(screen.queryByTestId("set-preview-result")).not.toBeInTheDocument();
  });

  it("disables the previews while the skill has no question", () => {
    render(<SetPreviewButtons skill="reading" questions={[]} />);

    expect(screen.getByTestId("set-preview-exam")).toBeDisabled();
    expect(screen.getByTestId("set-preview-result")).toBeDisabled();
  });

  it("opens the overlay in the mode the clicked button asks for", async () => {
    render(<SetPreviewButtons skill="listening" questions={[question("listening")]} />);
    expect(screen.queryByTestId("preview-overlay")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("set-preview-result"));

    const overlay = screen.getByTestId("preview-overlay");
    expect(overlay).toHaveAttribute("data-mode", "result");
    expect(overlay).toHaveAttribute("data-skill", "listening");
  });
});
