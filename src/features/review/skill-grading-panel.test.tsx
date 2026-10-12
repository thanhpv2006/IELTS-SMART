import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpeakingGradingPanel, WritingGradingPanel } from "./skill-grading-panel";
import type { AnswerItem } from "@/features/partner/api";
import type { SpeakingResult } from "@/features/partner/result-types";
import type { WritingResult } from "@/features/writing/writing-result-types";

const speakingAnswers: AnswerItem[] = [
  { sequence: 1, part: 1, audio_url: "https://example.test/a1.webm", question_prompt: "<p>Do you work?</p>" },
  { sequence: 2, part: 1, audio_url: "https://example.test/a2.webm", question_prompt: "<p>Do you study?</p>" },
];

describe("SpeakingGradingPanel manual", () => {
  it("renders an empty frame with audio, blank criteria and no transcript or AI wording", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SpeakingGradingPanel result={{ criteria: {} } as SpeakingResult} answers={speakingAnswers} manual onChange={onChange} />,
    );

    expect(screen.getByRole("heading", { name: "Nhận xét & lỗi" })).toBeTruthy();
    expect(container.textContent).not.toContain("của AI");
    expect(screen.queryByTestId("speaking-script")).toBeNull();
    expect(screen.queryByText("Không có ghi âm")).toBeNull();
    expect(screen.getAllByText("Question 1").length).toBe(1);
    const built = onChange.mock.calls.at(-1)?.[0] as SpeakingResult;
    expect(built.overall_band).toBeUndefined();
  });

  it("keeps the AI heading for AI results", () => {
    render(<SpeakingGradingPanel result={{ criteria: {} } as SpeakingResult} answers={speakingAnswers} onChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Nhận xét & lỗi của AI" })).toBeTruthy();
  });
});

describe("WritingGradingPanel manual", () => {
  const multiFrame = {
    schema_version: "writing_multitask_v1",
    multi_task: true,
    tasks: [
      { part: 1, task_type: "Task1", criteria: {} },
      { part: 2, task_type: "Task2", criteria: {} },
    ],
  } as unknown as WritingResult;
  const essays: AnswerItem[] = [
    { sequence: 2, part: 2, essay_text: "Second essay body." },
    { sequence: 1, part: 1, essay_text: "First essay body." },
  ];

  it("pairs each task with its essay in sequence order and hides the corrected essay", () => {
    const { container, rerender } = render(
      <WritingGradingPanel result={multiFrame} answers={essays} activeIdx={0} manual onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("essay-highlight").textContent).toBe("First essay body.");
    expect(screen.queryByRole("button", { name: "Bản sửa gợi ý" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Nhận xét & lỗi" })).toBeTruthy();
    expect(container.textContent).not.toContain("của AI");

    rerender(<WritingGradingPanel result={multiFrame} answers={essays} activeIdx={1} manual onChange={vi.fn()} />);
    expect(screen.getByTestId("essay-highlight").textContent).toBe("Second essay body.");
  });

  it("keeps the answer order for AI results; only manual results are sorted by sequence", () => {
    render(<WritingGradingPanel result={multiFrame} answers={essays} activeIdx={0} onChange={vi.fn()} />);
    expect(screen.getByTestId("essay-highlight").textContent).toBe("Second essay body.");
  });

  it("hides the AI error source label only for manual results", () => {
    const withError = {
      task_type: "Task2",
      criteria: {},
      errors: [{ errors: [{ criterion_code: "GRA", error_type: "grammar", error_part: "is go", correction: "goes", explanation: "verb form" }] }],
    } as unknown as WritingResult;
    const answers: AnswerItem[] = [{ sequence: 1, essay_text: "He is go to school." }];

    const { unmount } = render(<WritingGradingPanel result={withError} answers={answers} manual onChange={vi.fn()} />);
    expect(screen.queryByText("AI", { exact: true })).toBeNull();
    unmount();

    render(<WritingGradingPanel result={withError} answers={answers} onChange={vi.fn()} />);
    expect(screen.getByText("AI", { exact: true })).toBeTruthy();
  });

  it("renders a single-task empty frame", () => {
    render(
      <WritingGradingPanel
        result={{ task_type: "Task2", criteria: {} } as unknown as WritingResult}
        answers={[{ sequence: 1, essay_text: "Only essay." }]}
        manual
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("essay-highlight").textContent).toBe("Only essay.");
  });

  it("keeps the corrected-essay tab for AI results", () => {
    render(<WritingGradingPanel result={{ task_type: "Task2", criteria: {} } as unknown as WritingResult} answers={[{ sequence: 1, essay_text: "x" }]} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Bản sửa gợi ý" })).toBeTruthy();
  });
});
