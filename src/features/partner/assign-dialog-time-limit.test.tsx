import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useAuthStore } from "@/stores/auth-store";

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  classList: vi.fn(),
  classGet: vi.fn(),
  studentList: vi.fn(),
  myStudentList: vi.fn(),
  listSets: vi.fn(),
}));

vi.mock("./api", () => ({
  assignmentApi: { assign: mocks.assign },
  classApi: { list: mocks.classList, get: mocks.classGet },
  studentApi: { list: mocks.studentList },
  myStudentApi: { list: mocks.myStudentList },
}));
vi.mock("@/features/catalog/api", () => ({ catalogApi: { listSets: mocks.listSets } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { AssignDialog } = await import("./assign-dialog");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const SETS = [
  { id: "r1", title: "Reading P1", kind: "practice", skill: "reading", status: "published", duration_minutes: 40 },
  { id: "w1", title: "Writing T1", kind: "practice", skill: "writing", status: "published" },
  { id: "sp1", title: "Speaking P2", kind: "practice", skill: "speaking", status: "published", duration_minutes: 15 },
];

const C1 = { id: "c1", name: "Lớp A", student_count: 2 };
const C1_DETAIL = {
  id: "c1",
  name: "Lớp A",
  students: [
    { user_id: "u1", display_name: "Học viên 1" },
    { user_id: "u2", display_name: "Học viên 2" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ role: "partner_owner" });
  mocks.listSets.mockResolvedValue(SETS);
  mocks.classList.mockResolvedValue([C1]);
  mocks.classGet.mockResolvedValue(C1_DETAIL);
  mocks.studentList.mockResolvedValue([]);
  mocks.myStudentList.mockResolvedValue([]);
  mocks.assign.mockResolvedValue({ ids: ["a1"] });
});

function open(preselectedSetId: string) {
  return render(<AssignDialog preselectedSetId={preselectedSetId} onClose={() => {}} />, { wrapper });
}

async function readyToSubmit() {
  await waitFor(() => expect(screen.getByTestId("assign-submit-btn")).toBeEnabled());
}

describe("AssignDialog — time limit", () => {
  it("prefills the time limit input from the set's duration", async () => {
    open("r1");

    await waitFor(() => expect(screen.getByTestId("assign-time-limit-input")).toHaveValue(40));
  });

  it("sends the edited time limit on submit", async () => {
    open("r1");
    const input = await screen.findByTestId("assign-time-limit-input");
    await readyToSubmit();

    await userEvent.clear(input);
    await userEvent.type(input, "25");
    await userEvent.click(screen.getByTestId("assign-submit-btn"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign).toHaveBeenCalledWith("r1", expect.objectContaining({ time_limit_minutes: 25 }));
  });

  it("sends no time limit once the field is cleared", async () => {
    open("r1");
    const input = await screen.findByTestId("assign-time-limit-input");
    await readyToSubmit();

    await userEvent.clear(input);
    await userEvent.click(screen.getByTestId("assign-submit-btn"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign.mock.calls[0][1].time_limit_minutes).toBeUndefined();
  });

  it("hides the time limit field for a Speaking set and sends none", async () => {
    open("sp1");
    await readyToSubmit();

    expect(screen.queryByTestId("assign-time-limit-input")).toBeNull();

    await userEvent.click(screen.getByTestId("assign-submit-btn"));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalledTimes(1));
    expect(mocks.assign.mock.calls[0][1].time_limit_minutes).toBeUndefined();
  });

  it("disables submit and warns when the value is out of range", async () => {
    open("r1");
    const input = await screen.findByTestId("assign-time-limit-input");
    await readyToSubmit();

    await userEvent.clear(input);
    await userEvent.type(input, "300");

    expect(screen.getByTestId("assign-submit-btn")).toBeDisabled();
    expect(screen.getByText("Thời gian làm bài phải từ 1 đến 240 phút.")).toBeInTheDocument();
  });

  it("leaves the field empty with a placeholder when the set has no duration", async () => {
    open("w1");

    const input = await screen.findByTestId("assign-time-limit-input");
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute("placeholder", "Không giới hạn");
  });
});
