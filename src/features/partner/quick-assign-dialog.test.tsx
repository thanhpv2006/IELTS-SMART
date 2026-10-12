import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ApiError } from "@/lib/api/errors";

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  assignmentCounts: vi.fn(),
  classGet: vi.fn(),
  listSets: vi.fn(),
}));

vi.mock("./api", () => ({
  assignmentApi: { assign: mocks.assign, assignmentCounts: mocks.assignmentCounts },
  classApi: { get: mocks.classGet },
}));
vi.mock("@/features/catalog/api", () => ({ catalogApi: { listSets: mocks.listSets } }));

const { QuickAssignDialog } = await import("./quick-assign-dialog");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const SETS = [
  { id: "s1", title: "IELTS 09", kind: "exam", skill: "reading", status: "published", duration_minutes: 20 },
  { id: "s2", title: "BTVN Writing 04", kind: "homework", skill: "writing", status: "published" },
  { id: "s3", title: "IELTS Smart Full Test 11", kind: "full_test", skill: "", status: "published" },
];

const ROSTER = {
  id: "c1",
  name: "Basic - 3.0",
  students: [{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u3" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSets.mockResolvedValue(SETS);
  mocks.assignmentCounts.mockResolvedValue({ s1: 3 });
  mocks.classGet.mockResolvedValue(ROSTER);
  mocks.assign.mockResolvedValue({ ids: ["a1"] });
});

function open() {
  return render(<QuickAssignDialog classId="c1" className="Basic - 3.0" onClose={() => {}} />, { wrapper });
}

describe("QuickAssignDialog", () => {
  it("lists every published set except full_test, with its lượt giao count", async () => {
    open();

    await waitFor(() => expect(screen.getByTestId("quick-assign-row-s1")).toBeInTheDocument());
    expect(screen.getByTestId("quick-assign-row-s2")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-assign-row-s3")).toBeNull();
    expect(screen.getByTestId("quick-assign-row-s1")).toHaveTextContent("3");
    expect(screen.getByText("· Basic - 3.0")).toBeInTheDocument();
  });

  it("assigns to the whole roster with no deadline when + is pressed", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-add-s1")).toBeEnabled());

    await userEvent.click(screen.getByTestId("quick-assign-add-s1"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign).toHaveBeenCalledWith("s1", {
      student_ids: ["u1", "u2", "u3"],
      class_id: "c1",
      time_limit_minutes: 20,
    });
    expect(mocks.assign.mock.calls[0][1]).not.toHaveProperty("deadline");
  });

  it("sends no time limit for a Speaking set", async () => {
    const s4 = { id: "s4", title: "Speaking P2", kind: "practice", skill: "speaking", status: "published", duration_minutes: 15 };
    mocks.listSets.mockResolvedValue([...SETS, s4]);
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-add-s4")).toBeEnabled());

    await userEvent.click(screen.getByTestId("quick-assign-add-s4"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign.mock.calls[0][1].time_limit_minutes).toBeUndefined();
  });

  it("sends no time limit for a set with no duration", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-add-s2")).toBeEnabled());

    await userEvent.click(screen.getByTestId("quick-assign-add-s2"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign.mock.calls[0][1].time_limit_minutes).toBeUndefined();
  });

  it("sends no time limit when the set's duration is out of range", async () => {
    const s5 = { id: "s5", title: "Reading Huge", kind: "practice", skill: "reading", status: "published", duration_minutes: 300 };
    mocks.listSets.mockResolvedValue([...SETS, s5]);
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-add-s5")).toBeEnabled());

    await userEvent.click(screen.getByTestId("quick-assign-add-s5"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign.mock.calls[0][1].time_limit_minutes).toBeUndefined();
  });

  it("shows on each row the minutes the + button will apply", async () => {
    open();

    await waitFor(() => expect(screen.getByTestId("quick-assign-row-s1")).toHaveTextContent("20 phút"));
    expect(screen.getByTestId("quick-assign-row-s2")).not.toHaveTextContent("phút");
  });

  it("counts repeat presses so the teacher sees what they just assigned", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-add-s1")).toBeEnabled());

    await userEvent.click(screen.getByTestId("quick-assign-add-s1"));
    await waitFor(() => expect(screen.getByTestId("quick-assign-extra-s1")).toHaveTextContent("+1"));

    await userEvent.click(screen.getByTestId("quick-assign-add-s1"));

    await waitFor(() => expect(screen.getByTestId("quick-assign-extra-s1")).toHaveTextContent("+2"));
  });

  it("keeps the historical total frozen until the dialog is reopened", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-add-s1")).toBeEnabled());
    mocks.assignmentCounts.mockResolvedValue({ s1: 4 });

    await userEvent.click(screen.getByTestId("quick-assign-add-s1"));

    await waitFor(() => expect(screen.getByTestId("quick-assign-extra-s1")).toHaveTextContent("+1"));
    expect(screen.getByTestId("quick-assign-row-s1")).toHaveTextContent("3+1");
    expect(mocks.assignmentCounts).toHaveBeenCalledTimes(1);
  });

  it("shows the fresh total once the dialog is closed and reopened", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const dialog = render(
      <QuickAssignDialog classId="c1" className="Basic - 3.0" onClose={() => {}} />,
      { wrapper: shared },
    );
    await waitFor(() => expect(screen.getByTestId("quick-assign-row-s1")).toHaveTextContent("3"));

    mocks.assignmentCounts.mockResolvedValue({ s1: 4 });
    dialog.unmount();
    render(<QuickAssignDialog classId="c1" className="Basic - 3.0" onClose={() => {}} />, { wrapper: shared });

    await waitFor(() => expect(screen.getByTestId("quick-assign-row-s1")).toHaveTextContent("4"));
  });

  it("assigns every ticked set at once, then clears the ticks", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-row-s1")).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText("Chọn IELTS 09"));
    await userEvent.click(screen.getByLabelText("Chọn BTVN Writing 04"));
    expect(screen.getByTestId("quick-assign-bulk")).toHaveTextContent("Giao bài (2)");

    await userEvent.click(screen.getByTestId("quick-assign-bulk"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("quick-assign-bulk")).toBeNull();
  });

  it("offers the three sort orders on hover, and reorders by name", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-row-s1")).toBeInTheDocument());

    await userEvent.hover(screen.getByRole("button", { name: "" }));
    const menu = await screen.findByTestId("quick-assign-sort-menu");
    expect([...menu.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Sắp xếp theo thứ tự",
      "Sắp xếp theo đề mới → cũ",
      "Sắp xếp theo đề cũ → mới",
    ]);

    await userEvent.click(screen.getByText("Sắp xếp theo thứ tự"));

    const titles = [...document.querySelectorAll('[data-testid^="quick-assign-row-"]')].map(
      (r) => r.textContent?.split("#")[0],
    );
    expect(titles).toEqual(["BTVN Writing 04", "IELTS 09"]);
  });

  it("refuses to assign to a class with no student", async () => {
    mocks.classGet.mockResolvedValue({ ...ROSTER, students: [] });
    open();

    await waitFor(() =>
      expect(screen.getByText("Lớp này chưa có học viên nào, chưa giao bài được.")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("quick-assign-add-s1")).toBeDisabled();
  });

  it("shows the backend message when assigning fails", async () => {
    mocks.assign.mockRejectedValue(
      new ApiError(402, { code: "quota_exceeded", message: "Trung tâm đã hết credit." }),
    );
    open();
    await waitFor(() => expect(screen.getByTestId("quick-assign-add-s1")).toBeEnabled());

    await userEvent.click(screen.getByTestId("quick-assign-add-s1"));

    await waitFor(() => expect(screen.getByText("Trung tâm đã hết credit.")).toBeInTheDocument());
  });
});
