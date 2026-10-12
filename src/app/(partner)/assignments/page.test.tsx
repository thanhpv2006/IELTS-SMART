import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  assignmentList: vi.fn(),
  assignmentCounts: vi.fn(),
  assign: vi.fn(),
  classList: vi.fn(),
  classGet: vi.fn(),
  resultList: vi.fn(),
  listSets: vi.fn(),
}));

vi.mock("@/features/partner/api", () => ({
  assignmentApi: {
    list: mocks.assignmentList,
    assignmentCounts: mocks.assignmentCounts,
    assign: mocks.assign,
  },
  classApi: { list: mocks.classList, get: mocks.classGet },
  resultApi: { list: mocks.resultList },
}));
vi.mock("@/features/catalog/api", () => ({ catalogApi: { listSets: mocks.listSets } }));
vi.mock("@/features/partner/assign-dialog", () => ({ AssignDialog: () => null }));
vi.mock("@/features/partner/test-results-dialog", () => ({
  TestResultsDialog: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div data-testid="results-dialog">{title}</div> : null,
}));

const AssignmentsPage = (await import("./page")).default;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const CLASSES = [
  { id: "c1", name: "Basic - 3.0", student_count: 1, assignment_count: 0, completion_rate: 0, status: "active", created_at: "2026-08-01T00:00:00Z" },
  { id: "c2", name: "Foundation", student_count: 0, assignment_count: 0, completion_rate: 0, status: "active", created_at: "2026-08-01T00:00:00Z" },
];

// c1 gets two runs: a Reading everyone finished, and a Speaking waiting on review. One further row
// is assigned individually, so the "Giao lẻ" folder has something to hold.
const ASSIGNMENTS = [
  { id: "a1", test_id: "t1", test_name: "IELTS Smart Reading Test 02", skill: "reading", tier: "exam", student_id: "u1", student_name: "A", status: "released", created_at: "2026-09-01T08:00:00Z", class_id: "c1", class_name: "Basic - 3.0" },
  { id: "a2", test_id: "t2", test_name: "Speaking Part 2 — Hobbies", skill: "speaking", tier: "homework", student_id: "u1", student_name: "A", status: "submitted", created_at: "2026-09-02T08:00:00Z", class_id: "c1", class_name: "Basic - 3.0" },
  { id: "a3", test_id: "t3", test_name: "IELTS Smart Full Test 09", skill: "writing", tier: "homework", student_id: "u9", student_name: "Z", status: "pending", created_at: "2026-09-03T08:00:00Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
  // The view toggle persists to localStorage, so a test that switches to grid would otherwise
  // decide the view for every test after it.
  localStorage.clear();
  mocks.assignmentList.mockResolvedValue(ASSIGNMENTS);
  mocks.classList.mockResolvedValue(CLASSES);
  mocks.resultList.mockResolvedValue([]);
  mocks.assignmentCounts.mockResolvedValue({});
  mocks.listSets.mockResolvedValue([]);
  mocks.classGet.mockResolvedValue({ ...CLASSES[0], students: [{ user_id: "u1" }] });
});

const open = () => render(<AssignmentsPage />, { wrapper });

describe("AssignmentsPage", () => {
  it("shows one folder per class plus Giao lẻ, empty classes included", async () => {
    open();

    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());
    expect(screen.getByTestId("class-folder-row-c1")).toHaveTextContent("Basic - 3.0");
    expect(screen.getByTestId("class-folder-row-c2")).toHaveTextContent("Foundation");
    expect(screen.getByTestId("class-folder-row-__solo__")).toHaveTextContent("Giao lẻ");
  });

  it("defaults to the list view", async () => {
    open();

    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());
    expect(screen.queryByTestId("class-folder-card-c1")).toBeNull();

    await userEvent.click(screen.getByTestId("view-grid"));

    expect(screen.getByTestId("class-folder-card-c1")).toBeInTheDocument();
    expect(screen.queryByTestId("class-folder-row-c1")).toBeNull();
  });

  it("counts the five stats over bài, not student rows", async () => {
    open();

    await waitFor(() => expect(screen.getByTestId("filter-stat-all")).toHaveTextContent("3"));
    expect(screen.getByTestId("filter-stat-open")).toHaveTextContent("3");
    expect(screen.getByTestId("filter-stat-needReview")).toHaveTextContent("1");
    expect(screen.getByTestId("filter-stat-dueSoon")).toHaveTextContent("0");
    expect(screen.getByTestId("filter-stat-closed")).toHaveTextContent("0");
  });

  it("hides the folders with nothing to review when that card is pressed", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c2")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("filter-stat-needReview"));

    expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument();
    expect(screen.queryByTestId("class-folder-row-c2")).toBeNull();
    expect(screen.queryByTestId("class-folder-row-__solo__")).toBeNull();
    expect(screen.getByTestId("class-folder-row-c1")).toHaveTextContent("1");
  });

  it("drills into a class and back out again", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("class-folder-row-c1"));

    expect(screen.getByTestId("assignments-group-title")).toHaveTextContent("Basic - 3.0");
    expect(screen.getByTestId("assignments-group-title")).toHaveTextContent("2 bài");
    expect(screen.getByText("IELTS Smart Reading Test 02")).toBeInTheDocument();
    expect(screen.getByText("Speaking Part 2 — Hobbies")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("assignments-back"));

    expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument();
    expect(screen.queryByTestId("assignments-group-title")).toBeNull();
  });

  // Regression: the cards used to count over every batch rather than the filtered set, so picking
  // a class left "Cần đánh giá 12" sitting above a list showing two rows.
  it("scopes the stat cards to the picked class, so no two numbers disagree", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("filter-stat-all")).toHaveTextContent("3"));

    const filter = screen.getByTestId("assignment-class-filter");
    await userEvent.click(filter.querySelector("button")!);
    await userEvent.click(within(filter).getByText("Basic - 3.0"));

    // The folder row says 2; the card must not keep saying 3.
    expect(screen.getByTestId("filter-stat-all")).toHaveTextContent("2");
    expect(screen.getByTestId("class-folder-row-c1")).toHaveTextContent("2");
  });

  it("keeps the filters applied when coming back from a class", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("filter-stat-needReview"));

    await userEvent.click(screen.getByTestId("class-folder-row-c1"));
    await userEvent.click(screen.getByTestId("assignments-back"));

    expect(screen.getByTestId("assignment-status-filter")).toHaveTextContent("Số bài cần đánh giá");
    expect(screen.queryByTestId("class-folder-row-c2")).toBeNull();
  });

  it("opens the status filter on hover alone", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());
    const filter = screen.getByTestId("assignment-status-filter");

    await userEvent.hover(filter.querySelector("button")!);

    expect(filter).toHaveTextContent("Số bài sắp hết hạn");
  });

  it("offers search, sort, bulk selection and a page size inside a class", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("class-folder-row-c1"));

    expect(screen.getByTestId("page-size")).toBeInTheDocument();
    expect(screen.getByTestId("class-bai-select-all")).toBeInTheDocument();
    // Selecting a run reveals the bulk bar the backend endpoints exist for.
    await userEvent.click(screen.getByLabelText("Chọn Speaking Part 2 — Hobbies"));
    expect(screen.getByText("Gia hạn")).toBeInTheDocument();
  });

  it("does not carry a selection back out of the class", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("class-folder-row-c1"));
    await userEvent.click(screen.getByLabelText("Chọn Speaking Part 2 — Hobbies"));

    await userEvent.click(screen.getByTestId("assignments-back"));

    expect(screen.queryByText("Gia hạn")).toBeNull();
  });

  it("opens the results dialog for the bài that is clicked", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("class-folder-row-c1"));

    await userEvent.click(screen.getByText("Speaking Part 2 — Hobbies"));

    expect(screen.getByTestId("results-dialog")).toHaveTextContent("Speaking Part 2 — Hobbies");
  });

  it("offers no per-set filter any more", async () => {
    open();

    await waitFor(() => expect(screen.getByTestId("class-folder-row-c1")).toBeInTheDocument());
    expect(screen.queryByText("Tất cả đề")).toBeNull();
    expect(screen.getByTestId("assignment-class-filter")).toBeInTheDocument();
    expect(screen.getByTestId("assignment-status-filter")).toBeInTheDocument();
  });

  it("opens quick assign from the folder row without drilling in", async () => {
    open();
    await waitFor(() => expect(screen.getByTestId("class-folder-assign-c1")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("class-folder-assign-c1"));

    expect(screen.queryByTestId("assignments-group-title")).toBeNull();
    await waitFor(() => expect(screen.getByText("· Basic - 3.0")).toBeInTheDocument());
  });

  it("gives the Giao lẻ folder no quick-assign button", async () => {
    open();

    await waitFor(() => expect(screen.getByTestId("class-folder-row-__solo__")).toBeInTheDocument());
    expect(screen.queryByTestId("class-folder-assign-__solo__")).toBeNull();
  });
});
