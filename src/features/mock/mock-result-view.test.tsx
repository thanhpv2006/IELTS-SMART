/**
 * Behavior test for the read-only full-test result view.
 * Proves the R/L fix: a graded objective skill with band 0 renders its actual
 * score ("0.0") plus the full ObjectiveResultView detail (right/wrong per question,
 * number correct, correct answers) — NOT "Chưa chấm" or the degraded "Chưa có chi tiết".
 */
import { render, screen } from "@testing-library/react";
import { MockResultView } from "./mock-result-view";
import type { MockResultPayload } from "./mock-result-types";

function gradedZeroReadingPayload(): MockResultPayload {
  return {
    overall_band: 1,
    skills: {
      reading: {
        band: 0,
        result: {
          kind: "objective",
          skill: "reading",
          raw: 0,
          total: 5,
          band: 0,
          sections: [
            {
              passage: "<p>Đoạn văn Reading</p>",
              items: [
                { number: 1, correct: false, prompt: "Câu hỏi số 1", correct_answers: ["A"], submitted: ["B"] },
              ],
            },
          ],
        },
      },
      listening: { band: 0, result: null },
      speaking: { band: 2.5, result: null },
      writing: { band: 1, result: null },
    },
  };
}

describe("MockResultView — R/L graded band 0", () => {
  it("shows band 0.0 and full objective detail, not 'Chưa chấm'/degraded", () => {
    render(<MockResultView result={gradedZeroReadingPayload()} audience="student" />);

    // Tab labels render the real band (0.0 for R/L), never "Chờ duyệt"/"Chưa chấm".
    expect(screen.getAllByText("· 0.0").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Chờ duyệt/)).toBeNull();

    // Default tab is Reading → ObjectiveResultView content is present…
    expect(screen.getByText("Chi tiết từng câu")).toBeTruthy();
    expect(screen.getByText("0/5")).toBeTruthy(); // number correct
    expect(screen.getByText("Câu hỏi số 1")).toBeTruthy();
    expect(screen.getByText(/Đáp án đúng/)).toBeTruthy();

    // …and the degraded fallback string is NOT rendered.
    expect(screen.queryByText(/Chưa có chi tiết theo câu hỏi/)).toBeNull();
  });
});
