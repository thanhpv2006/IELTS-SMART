import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckpointProblems } from "./checkpoint-problems";
import type { AIImportAuditFinding } from "./types";

const PROBLEMS: AIImportAuditFinding[] = [
  {
    code: "classification_no_audio",
    level: "warn",
    skill: "listening",
    question: 0,
    message: "Có đề Listening nhưng chưa thấy file audio.",
  },
  {
    code: "classification_unrecognized_file",
    level: "warn",
    skill: "",
    question: 0,
    message: "Không nhận ra nội dung file ghi-chu.docx.",
  },
];

describe("CheckpointProblems", () => {
  it("lists every problem that held the job at the checkpoint", () => {
    render(<CheckpointProblems problems={PROBLEMS} />);

    const section = screen.getByTestId("ai-import-checkpoint-problems");
    expect(section).toHaveTextContent("Máy dừng lại để bạn xem trước khi dựng đề");
    expect(screen.getByTestId("ai-import-problem-classification_no_audio")).toHaveTextContent(
      "Có đề Listening nhưng chưa thấy file audio.",
    );
    expect(screen.getByTestId("ai-import-problem-classification_unrecognized_file")).toHaveTextContent("Chung");
  });

  it("renders nothing when there is no problem", () => {
    const { container } = render(<CheckpointProblems problems={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
