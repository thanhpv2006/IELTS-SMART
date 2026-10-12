/**
 * Behaviour of the student "Bài tập" screen: the urgent strip only surfaces work
 * that is still to be done and actually urgent, and work past its deadline can
 * no longer be opened (the backend refuses such a submit, so the UI must not
 * invite a student into a sitting they cannot hand in).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString();

const { state } = vi.hoisted(() => ({ state: { assignments: [] as unknown[] } }));

vi.mock("@/features/student/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/student/api")>();
  return {
    ...actual,
    studentAssignmentApi: { ...actual.studentAssignmentApi, list: vi.fn(async () => state.assignments) },
    studentResultApi: { ...actual.studentResultApi, list: vi.fn(async () => []), get: vi.fn() },
  };
});

vi.mock("@/app/(partner)/results/[id]/page", () => ({ StudentResultView: () => null }));

import StudentAssignmentsPage from "@/app/(student)/student/assignments/page";

const assignment = (over: Record<string, unknown>) => ({
  id: "a1",
  test_id: "t1",
  test_name: "Reading Test 01",
  skill: "reading",
  tier: "practice",
  status: "pending",
  created_at: iso(-3),
  origin: "assigned",
  purpose: "practice",
  ...over,
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("student assignments — urgent strip", () => {
  beforeEach(() => {
    state.assignments = [];
  });

  it("surfaces work due within two days", async () => {
    state.assignments = [assignment({ id: "urgent-1", deadline: iso(1) })];
    render(wrap(<StudentAssignmentsPage />));

    await waitFor(() => expect(screen.getByTestId("urgent-strip")).toBeInTheDocument());
    expect(screen.getByTestId("urgent-item-urgent-1")).toBeInTheDocument();
  });

  it("stays hidden when nothing is urgent", async () => {
    state.assignments = [assignment({ id: "relaxed", deadline: iso(10) })];
    render(wrap(<StudentAssignmentsPage />));

    await waitFor(() => expect(screen.getByTestId("assignment-card-relaxed")).toBeInTheDocument());
    expect(screen.queryByTestId("urgent-strip")).not.toBeInTheDocument();
  });

  it("ignores work already handed in, even when overdue", async () => {
    state.assignments = [assignment({ id: "handed-in", status: "submitted", deadline: iso(-2) })];
    render(wrap(<StudentAssignmentsPage />));

    await waitFor(() => expect(screen.getByTestId("assignment-card-handed-in")).toBeInTheDocument());
    expect(screen.queryByTestId("urgent-strip")).not.toBeInTheDocument();
  });

  it("keeps urgent work in the full list as well", async () => {
    state.assignments = [assignment({ id: "urgent-2", deadline: iso(1) })];
    render(wrap(<StudentAssignmentsPage />));

    await waitFor(() => expect(screen.getByTestId("urgent-strip")).toBeInTheDocument());
    expect(screen.getByTestId("assignment-card-urgent-2")).toBeInTheDocument();
  });
});

describe("student assignments — overdue work cannot be opened", () => {
  beforeEach(() => {
    state.assignments = [];
  });

  it("drops the take button and says so when the deadline has passed", async () => {
    state.assignments = [assignment({ id: "late", deadline: iso(-1) })];
    render(wrap(<StudentAssignmentsPage />));

    await waitFor(() => expect(screen.getByTestId("assignment-card-late")).toBeInTheDocument());
    expect(screen.queryByTestId("take-btn-late")).not.toBeInTheDocument();
    expect(screen.getByTestId("deadline-badge-late")).toHaveTextContent("Quá hạn");
  });

  it("still offers the take button while the deadline holds", async () => {
    state.assignments = [assignment({ id: "in-time", deadline: iso(5) })];
    render(wrap(<StudentAssignmentsPage />));

    await waitFor(() => expect(screen.getByTestId("take-btn-in-time")).toBeInTheDocument());
  });

  it("offers the take button when there is no deadline at all", async () => {
    state.assignments = [assignment({ id: "no-due", deadline: undefined })];
    render(wrap(<StudentAssignmentsPage />));

    await waitFor(() => expect(screen.getByTestId("take-btn-no-due")).toBeInTheDocument());
    expect(screen.getByTestId("deadline-badge-no-due")).toHaveTextContent("Không hạn");
  });
});
