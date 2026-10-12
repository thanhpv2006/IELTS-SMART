/**
 * Component tests for the "Bài tập" filters.
 *
 * Feedback 18/08/2026: deleting a class or a set left it sitting in the filters, where picking it
 * dead-ended on "Không có bài khớp bộ lọc". Both halves of that fix still have to hold after the
 * class-folders redesign, which dropped the per-set filter and now builds the class filter from the
 * live class list instead of from the assignment rows:
 *   - a deleted class must not be offered, and its work must read as "Giao lẻ";
 *   - a deleted set must still be reachable, under the fallback title, since there is no set filter
 *     left to strand it in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { assignments, classes } = vi.hoisted(() => ({
  assignments: [
    {
      id: "a1",
      test_id: "t-live",
      test_name: "IELTS Smart Reading Test 01",
      skill: "reading",
      tier: "practice",
      student_id: "s1",
      status: "assigned",
      created_at: "2026-08-01T00:00:00.000Z",
      class_id: "c-live",
      class_name: "Anh Minh IELTS",
    },
    // Set deleted after assignment → BE omits test_name.
    {
      id: "a2",
      test_id: "t-deleted",
      skill: "reading",
      tier: "practice",
      student_id: "s2",
      status: "assigned",
      created_at: "2026-08-02T00:00:00.000Z",
      class_id: "c-live",
      class_name: "Anh Minh IELTS",
    },
    // Class deleted after assignment → BE omits class_name, so it reads as "Giao lẻ".
    {
      id: "a3",
      test_id: "t-live",
      test_name: "IELTS Smart Reading Test 01",
      skill: "reading",
      tier: "practice",
      student_id: "s3",
      status: "assigned",
      created_at: "2026-08-03T00:00:00.000Z",
      class_id: "c-gone",
    },
  ],
  classes: [
    {
      id: "c-live",
      name: "Anh Minh IELTS",
      student_count: 2,
      assignment_count: 0,
      completion_rate: 0,
      status: "active",
      created_at: "2026-07-01T00:00:00.000Z",
    },
  ],
}));

vi.mock("@/features/partner/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/partner/api")>();
  return {
    ...actual,
    assignmentApi: { ...actual.assignmentApi, list: vi.fn(async () => assignments) },
    classApi: { ...actual.classApi, list: vi.fn(async () => classes) },
    resultApi: { ...actual.resultApi, list: vi.fn(async () => []) },
  };
});

import AssignmentsPage from "@/app/(partner)/assignments/page";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  render(<AssignmentsPage />, { wrapper: makeWrapper() });
});

async function classFilterOptions(): Promise<string[]> {
  const filter = await screen.findByTestId("assignment-class-filter");
  await waitFor(() => expect(screen.getByTestId("class-folder-row-c-live")).toBeInTheDocument());
  await userEvent.click(within(filter).getByRole("button"));
  return within(filter)
    .getAllByRole("button")
    .slice(1)
    .map((b) => b.textContent ?? "");
}

describe("Bài tập — bộ lọc chỉ liệt kê lớp còn tồn tại", () => {
  it("offers only live classes plus the Giao lẻ bucket in the lớp filter", async () => {
    expect(await classFilterOptions()).toEqual(["Tất cả lớp", "Anh Minh IELTS", "Giao lẻ"]);
  });

  it("files work frozen to a deleted class under Giao lẻ", async () => {
    await waitFor(() => expect(screen.getByTestId("class-folder-row-__solo__")).toBeInTheDocument());

    expect(screen.getByTestId("class-folder-row-__solo__")).toHaveTextContent("Giao lẻ");
    expect(screen.getByTestId("class-folder-row-c-live")).toHaveTextContent("2");
  });

  it("still reaches a deleted set, under its fallback title", async () => {
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c-live")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("class-folder-row-c-live"));

    expect(screen.getByText("IELTS Smart Reading Test 01")).toBeInTheDocument();
    expect(screen.getByText("Đề t-delete")).toBeInTheDocument();
  });

  it("no longer offers a per-set filter to strand anything in", async () => {
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c-live")).toBeInTheDocument());

    expect(screen.queryByTestId("assignment-test-filter")).toBeNull();
    expect(screen.queryByText("Tất cả đề")).toBeNull();
  });
});
