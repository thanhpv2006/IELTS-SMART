import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClassificationPanel } from "./classification-panel";
import type { AIImportInventoryFile, AIImportRegion } from "./types";

function region(overrides: Partial<AIImportRegion> = {}): AIImportRegion {
  return {
    role: "reading_paper",
    skill: "reading",
    unit: 1,
    source_key: "k-paper",
    page_from: 1,
    page_to: 4,
    char_from: 0,
    char_to: 0,
    confidence: "high",
    evidence: "Thấy READING PASSAGE 1",
    source: "rubric",
    ...overrides,
  };
}

function inventoryFile(overrides: Partial<AIImportInventoryFile> = {}): AIImportInventoryFile {
  return {
    key: "k-paper",
    filename: "de-reading.pdf",
    content_type: "application/pdf",
    bytes: 1024,
    sha256: "aa",
    pages: 8,
    has_text_layer: true,
    duration_ms: 0,
    duplicate_of: "",
    regions: [region()],
    ...overrides,
  };
}

const ANSWER_FILE = inventoryFile({
  key: "k-answers",
  filename: "dap-an.docx",
  content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pages: 0,
  has_text_layer: false,
  regions: [
    region({
      role: "answer_key",
      skill: "reading",
      unit: 0,
      source_key: "k-answers",
      page_from: 0,
      page_to: 0,
      char_from: 0,
      char_to: 400,
      evidence: "Thấy ĐÁP ÁN",
    }),
    region({
      role: "transcript",
      skill: "listening",
      unit: 0,
      source_key: "k-answers",
      page_from: 0,
      page_to: 0,
      char_from: 400,
      char_to: 2000,
      confidence: "medium",
      evidence: "Thấy You will hear",
      source: "llm",
    }),
  ],
});

describe("ClassificationPanel", () => {
  it("shows one row per region, not one per file", () => {
    render(
      <ClassificationPanel inventory={[inventoryFile(), ANSWER_FILE]} onConfirm={vi.fn()} submitting={false} />,
    );

    expect(screen.getAllByRole("combobox", { name: /^Vai trò vùng/ })).toHaveLength(3);
    expect(screen.getByText("trang 1–4")).toBeInTheDocument();
    expect(screen.getByText("ký tự 400–2000")).toBeInTheDocument();
  });

  it("sends back the reviewer's correction, not what the classifier guessed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ClassificationPanel inventory={[inventoryFile(), ANSWER_FILE]} onConfirm={onConfirm} submitting={false} />,
    );

    await user.selectOptions(screen.getByTestId("ai-import-role-dap-an.docx-1"), "explanation");
    await user.selectOptions(screen.getByTestId("ai-import-skill-de-reading.pdf-0"), "listening");
    await user.click(screen.getByTestId("ai-import-confirm-classification"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const sent = onConfirm.mock.calls[0][0] as AIImportRegion[];
    expect(sent).toHaveLength(3);
    expect(sent.find((r) => r.char_from === 400)?.role).toBe("explanation");
    expect(sent.find((r) => r.source_key === "k-paper")?.skill).toBe("listening");
  });

  // A twin file is read from its original; sending its regions would double every question.
  it("labels a duplicate file and leaves its regions out of the payload", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const twin = inventoryFile({
      key: "k-paper-copy",
      filename: "de-reading (1).pdf",
      duplicate_of: "k-paper",
      regions: [region({ source_key: "k-paper-copy" })],
    });
    render(
      <ClassificationPanel inventory={[inventoryFile(), twin]} onConfirm={onConfirm} submitting={false} />,
    );

    expect(screen.getByText("trùng file de-reading.pdf")).toBeInTheDocument();
    await user.click(screen.getByTestId("ai-import-confirm-classification"));

    const sent = onConfirm.mock.calls[0][0] as AIImportRegion[];
    expect(sent.map((r) => r.source_key)).toEqual(["k-paper"]);
  });

  // Without this the checkpoint cannot rescue a file the classifier read as nothing.
  it("lets the reviewer add a region to a file nothing was found in", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const blank = inventoryFile({ key: "k-ws", filename: "speaking-writing.docx", regions: [] });
    render(<ClassificationPanel inventory={[blank]} onConfirm={onConfirm} submitting={false} />);

    expect(screen.getByText(/Không nhận ra phần nào/)).toBeInTheDocument();
    await user.click(screen.getByTestId("ai-import-add-region-speaking-writing.docx"));
    await user.selectOptions(screen.getByTestId("ai-import-role-speaking-writing.docx-0"), "writing_task");
    await user.selectOptions(screen.getByTestId("ai-import-skill-speaking-writing.docx-0"), "writing");
    await user.click(screen.getByTestId("ai-import-confirm-classification"));

    const sent = onConfirm.mock.calls[0][0] as AIImportRegion[];
    expect(sent).toEqual([
      expect.objectContaining({ source_key: "k-ws", role: "writing_task", skill: "writing", char_to: 0 }),
    ]);
  });

  // Part 0 means "cut this file at its own Questions N headings". A reviewer who reads it as a
  // blank and types 1 puts the whole paper back into part 1, which is the fold this pipeline
  // exists to avoid.
  it("says what part 0 means instead of leaving it looking unset", () => {
    render(
      <ClassificationPanel
        inventory={[inventoryFile({ regions: [region({ unit: 0 })] })]}
        onConfirm={vi.fn()}
        submitting={false}
      />,
    );

    expect(screen.getByText("tự chia theo số câu")).toBeInTheDocument();
  });

  it("blocks a second confirm while the first is still running", () => {
    render(<ClassificationPanel inventory={[inventoryFile()]} onConfirm={vi.fn()} submitting />);
    expect(screen.getByTestId("ai-import-confirm-classification")).toBeDisabled();
  });
});
