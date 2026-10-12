import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";

import type { Assignment, AssignmentResult } from "@/features/partner/api";

vi.mock("@/app/(partner)/results/[id]/page", () => ({ ResultReviewModal: () => null }));
vi.mock("@/features/mock/mock-result-review", () => ({ MockResultReview: () => null }));

const { TestResultsDialog } = await import("./test-results-dialog");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const handedIn: Assignment = {
  id: "a1",
  test_id: "t1",
  student_id: "u1",
  student_name: "Nguyễn Văn A",
  status: "reviewed",
  created_at: "2026-09-01T08:00:00Z",
};

const missing: Assignment = {
  id: "a2",
  test_id: "t1",
  student_id: "u2",
  student_name: "Trần Thị B",
  status: "pending",
  created_at: "2026-09-01T08:00:00Z",
};

const result = {
  id: "r1",
  assignment_id: "a1",
  submission_id: "s1",
  review_status: "approved",
  result: { kind: "objective", skill: "reading", raw: 9, total: 13, band: 5, sections: [] },
  band: 5,
  created_at: "2026-09-02T01:10:00Z",
} as unknown as AssignmentResult;

function open() {
  return render(
    <TestResultsDialog
      open
      title="IELTS Smart Reading Test 02"
      subtitle="Basic - 3.0"
      skill="reading"
      total={2}
      submitted={1}
      assignments={[handedIn, missing]}
      results={[result]}
      isLoading={false}
      onClose={() => {}}
    />,
    { wrapper },
  );
}

describe("TestResultsDialog", () => {
  it("lists the student who has not submitted, with no review action", () => {
    open();

    const row = screen.getByTestId("result-row-missing-a2");
    expect(row).toHaveTextContent("Trần Thị B");
    expect(row).toHaveTextContent("Chưa nộp bài");
    expect(row.querySelector("button")).toBeNull();
  });

  it("leaves the reviewed student's row as it was", () => {
    open();

    const row = screen.getByTestId("result-row-a1");
    expect(row).toHaveTextContent("Đã đánh giá");
    expect(row).toHaveTextContent("9/13");
    expect(row).not.toHaveTextContent("5.0");
    expect(row).toHaveTextContent("Xem lại");
  });

  it("does not let a non-submitter disturb the counts", () => {
    open();

    expect(screen.getByTestId("result-summary-all")).toHaveTextContent("1/2");
    expect(screen.getByTestId("result-summary-reviewed")).toHaveTextContent("1");
    expect(screen.getByTestId("result-summary-pending")).toHaveTextContent("0");
    expect(screen.getByText("1 học viên đã nộp bài")).toBeInTheDocument();
  });

  it("invents no row for a student who was never assigned the bài", () => {
    open();

    // Two assignments in, two rows out: the dialog never reaches for a class roster, so a student
    // who joined the class after the giao cannot appear as a non-submitter.
    expect(document.querySelectorAll('[data-testid^="result-row-"]')).toHaveLength(2);
  });

  it("says nobody was assigned when there is no row at all", () => {
    render(
      <TestResultsDialog
        open
        title="IELTS Smart Reading Test 02"
        total={0}
        submitted={0}
        assignments={[]}
        results={[]}
        isLoading={false}
        onClose={() => {}}
      />,
      { wrapper },
    );

    expect(screen.getByText("Chưa có học viên nào được giao bài này.")).toBeInTheDocument();
  });
});
