import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth-store";

const mocks = vi.hoisted(() => ({
  studentList: vi.fn(),
  myStudentList: vi.fn(),
  classList: vi.fn(),
  classGet: vi.fn(),
  listSets: vi.fn(),
}));

vi.mock("./api", () => ({
  assignmentApi: { assign: vi.fn() },
  classApi: { list: mocks.classList, get: mocks.classGet },
  studentApi: { list: mocks.studentList },
  myStudentApi: { list: mocks.myStudentList },
}));
vi.mock("@/features/catalog/api", () => ({ catalogApi: { listSets: mocks.listSets } }));
vi.mock("@/features/mock/api", () => ({ mockApi: { assignMock: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { AssignDialog } = await import("./assign-dialog");
const { MockAssignDialog } = await import("./mock-assign-dialog");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TWO_CLASSES = [
  { id: "c1", name: "Lớp A", student_count: 1 },
  { id: "c2", name: "Lớp B", student_count: 0 },
];

const student = (user_id: string, display_name: string) => ({
  user_id,
  display_name,
  classes: [{ id: "c1", name: "Lớp A" }],
  assignment_done: 0,
  assignment_total: 0,
  credit_limit: null,
  credits_used: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.classList.mockResolvedValue(TWO_CLASSES);
  mocks.listSets.mockResolvedValue([]);
  // GET /students is partner_owner-only: a teacher gets 403 from the backend.
  mocks.studentList.mockImplementation(() =>
    useAuthStore.getState().role === "teacher"
      ? Promise.reject(new ApiError(403, { code: "forbidden", message: "forbidden" }))
      : Promise.resolve([student("u-owner", "Học viên cả trung tâm")]),
  );
  mocks.myStudentList.mockResolvedValue([student("u-teacher", "Học viên lớp mình")]);
});

const dialogs = [
  ["AssignDialog", () => <AssignDialog preselectedSetId="s1" onClose={() => {}} />],
  ["MockAssignDialog", () => <MockAssignDialog setId="m1" onClose={() => {}} />],
] as const;

describe.each(dialogs)("%s — Chọn học viên", (_name, renderDialog) => {
  it("lists the teacher's own students when a teacher assigns individually", async () => {
    useAuthStore.setState({ role: "teacher" });
    render(renderDialog(), { wrapper });

    await userEvent.click(screen.getByRole("button", { name: "Chọn học viên" }));

    expect(await screen.findByText("Học viên lớp mình")).toBeInTheDocument();
    expect(mocks.studentList).not.toHaveBeenCalled();
  });

  it("lists every student of the centre for the owner", async () => {
    useAuthStore.setState({ role: "partner_owner" });
    render(renderDialog(), { wrapper });

    await userEvent.click(screen.getByRole("button", { name: "Chọn học viên" }));

    expect(await screen.findByText("Học viên cả trung tâm")).toBeInTheDocument();
    expect(mocks.myStudentList).not.toHaveBeenCalled();
  });
});
