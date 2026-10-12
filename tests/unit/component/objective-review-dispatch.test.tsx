/**
 * Component tests for the L/R (objective) review dispatch fix.
 *
 * Regression guard for the "blank result" bug: ReviewShell used to discriminate
 * only Speaking/Writing, so an objective (Reading/Listening) payload opened from
 * an in-app dialog fell through to the Speaking renderer and showed nothing.
 * These tests mount the two public wrappers (ResultReviewModal = teacher,
 * StudentResultView = student) with an objective payload and assert the
 * ObjectiveResultView content renders. L/R is auto-scored + auto-published to
 * students, so BOTH audiences are read-only — there is no "Duyệt & công bố".
 *
 * Cases:
 *   OBJ-01 — Teacher dialog renders objective detail, read-only (no approve).
 *   OBJ-02 — Student view renders objective detail, read-only (no approve).
 *   OBJ-03 — Both titles name the skill actually taken, not the "Reading/Listening" pair.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { objectiveResult } = vi.hoisted(() => ({
  objectiveResult: {
    id: "r1",
    result: {
      kind: "objective",
      skill: "reading",
      raw: 1,
      total: 2,
      band: 6,
      sections: [
        {
          passage: "<p>Money Transfers by Mobile</p>",
          items: [
            { number: 1, correct: true, prompt: "Q1", submitted: ["A"], correct_answers: ["A"] },
            { number: 2, correct: false, prompt: "Q2", submitted: ["B"], correct_answers: ["C"] },
          ],
        },
      ],
    },
    skill: "reading",
    review_status: "pending",
    created_at: "2026-07-27T00:00:00.000Z",
    student_name: "Học viên A",
    answers: [],
  },
}));

vi.mock("@/features/partner/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/partner/api")>();
  return {
    ...actual,
    resultApi: { ...actual.resultApi, get: vi.fn(async () => objectiveResult), approve: vi.fn(async () => objectiveResult) },
  };
});

vi.mock("@/features/student/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/student/api")>();
  return {
    ...actual,
    studentResultApi: { ...actual.studentResultApi, get: vi.fn(async () => objectiveResult) },
  };
});

// Imported after the mocks so the wrappers pick up the stubbed api modules.
import { ResultReviewModal, StudentResultView } from "@/app/(partner)/results/[id]/page";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("OBJ-01 — teacher dialog renders objective result (not blank), read-only", () => {
  it("shows the per-question detail with no approve control", async () => {
    render(<ResultReviewModal id="r1" onClose={vi.fn()} />, { wrapper: makeWrapper() });

    // ObjectiveResultView marker — proves we did NOT fall through to Speaking.
    expect(await screen.findByText("Chi tiết từng câu")).toBeInTheDocument();
    // L/R is auto-published — teacher just reviews, no approve button.
    expect(screen.queryByText("Duyệt & công bố")).not.toBeInTheDocument();
  });
});

describe("OBJ-02 — student view renders objective result, read-only", () => {
  it("shows the per-question detail with no approve control", async () => {
    render(<StudentResultView id="r1" onClose={vi.fn()} />, { wrapper: makeWrapper() });

    expect(await screen.findByText("Chi tiết từng câu")).toBeInTheDocument();
    expect(screen.queryByText("Duyệt & công bố")).not.toBeInTheDocument();
  });
});

describe("OBJ-03 — the title names the skill that was taken", () => {
  it("says Reading for a reading result, for teacher and student alike", async () => {
    const { unmount } = render(<ResultReviewModal id="r1" onClose={vi.fn()} />, { wrapper: makeWrapper() });
    // Only the heading matters here — the footer note still talks about "Reading/Listening"
    // as a policy, which is correct.
    expect(await screen.findByRole("heading", { name: "Kết quả bài luyện (Reading)" })).toBeInTheDocument();
    unmount();

    render(<StudentResultView id="r1" onClose={vi.fn()} />, { wrapper: makeWrapper() });
    expect(await screen.findByRole("heading", { name: "Kết quả bài thi (Reading)" })).toBeInTheDocument();
  });
});
