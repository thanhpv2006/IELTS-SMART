import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogQuestionSet } from "@/features/catalog/types";
import { useAuthStore } from "@/stores/auth-store";

const mocks = vi.hoisted(() => ({
  listSetsPage: vi.fn(),
  archiveSet: vi.fn(),
  restoreSet: vi.fn(),
  deleteSet: vi.fn(),
  assignmentCounts: vi.fn(),
}));

vi.mock("@/features/catalog/api", () => ({
  catalogApi: {
    listSetsPage: mocks.listSetsPage,
    archiveSet: mocks.archiveSet,
    restoreSet: mocks.restoreSet,
    deleteSet: mocks.deleteSet,
  },
}));
vi.mock("@/features/partner/api", () => ({ assignmentApi: { assignmentCounts: mocks.assignmentCounts } }));
// The list keeps its tab/filters/page in the URL, so the router mock has to hold a live query string.
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      for (const l of listeners) l();
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    push: vi.fn(),
    replace: vi.fn(),
  };
});
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => ({
      push: nav.push,
      replace: (href: string, options?: { scroll?: boolean }) => {
        nav.replace(href, options);
        nav.set(href.split("?")[1] ?? "");
      },
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get)),
  };
});
vi.mock("@/features/partner/use-feature-flag", () => ({ useFeatureFlag: () => ({ enabled: false }) }));
vi.mock("@/features/partner/library-panel", () => ({ LibraryPanel: () => null }));
vi.mock("@/features/catalog/create-set-dialog", () => ({ CreateSetDialog: () => null }));
vi.mock("@/features/catalog/import-button", () => ({ ImportMenu: () => null }));
vi.mock("@/features/partner/mock-assign-dialog", () => ({ MockAssignDialog: () => null }));
// BankSetCard renders setCode from this module, so only the dialog is stubbed.
vi.mock("@/features/partner/assign-dialog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/partner/assign-dialog")>()),
  AssignDialog: () => null,
}));

const BanksPage = (await import("./page")).default;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeSet(id: string, overrides: Partial<CatalogQuestionSet> = {}): CatalogQuestionSet {
  return {
    id,
    title: `Set ${id}`,
    description: "",
    kind: "practice",
    status: "published",
    skill: "speaking",
    practice_enabled: false,
    can_manage: true,
    item_count: 1,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const SETS = [makeSet("s1"), makeSet("s2"), makeSet("s3", { can_manage: false })];

beforeEach(() => {
  vi.clearAllMocks();
  nav.set("");
  sessionStorage.clear();
  useAuthStore.setState({ role: "partner_owner" });
  mocks.listSetsPage.mockImplementation((filter: { status?: string }) =>
    Promise.resolve(
      filter.status === "archived"
        ? { items: [makeSet("a1", { status: "archived" })], total: 1 }
        : { items: SETS, total: SETS.length },
    ),
  );
  mocks.assignmentCounts.mockResolvedValue({});
  mocks.archiveSet.mockResolvedValue(undefined);
  mocks.restoreSet.mockResolvedValue(undefined);
  mocks.deleteSet.mockResolvedValue(undefined);
});

const open = async () => {
  render(<BanksPage />, { wrapper });
  await waitFor(() => expect(screen.getByTestId("bank-card-s1")).toBeInTheDocument());
};

describe("BanksPage lifecycle actions", () => {
  it("offers no selection or menu on a set the caller cannot manage", async () => {
    await open();

    expect(screen.getByTestId("bank-select-s1")).toBeInTheDocument();
    expect(screen.queryByTestId("bank-select-s3")).toBeNull();
    expect(screen.queryByTestId("bank-card-menu-s3")).toBeNull();
  });

  it("archives every selected set from the bulk bar", async () => {
    await open();

    await userEvent.click(screen.getByTestId("bank-select-s1"));
    await userEvent.click(screen.getByTestId("bank-select-s2"));
    expect(screen.getByTestId("set-bulk-bar")).toHaveTextContent("Đã chọn 2 đề");

    await userEvent.click(screen.getByTestId("set-bulk-archive"));

    await waitFor(() => expect(screen.getByTestId("set-lifecycle-message")).toHaveTextContent("Đã lưu trữ 2 đề."));
    expect(mocks.archiveSet).toHaveBeenCalledWith("s1");
    expect(mocks.archiveSet).toHaveBeenCalledWith("s2");
  });

  it("keeps a set that failed to delete selected and reports the partial result", async () => {
    mocks.deleteSet.mockImplementation((id: string) =>
      id === "s2" ? Promise.reject(new Error("Không tìm thấy")) : Promise.resolve(),
    );
    await open();

    await userEvent.click(screen.getByTestId("bank-select-s1"));
    await userEvent.click(screen.getByTestId("bank-select-s2"));
    await userEvent.click(screen.getByTestId("set-bulk-delete"));
    await userEvent.click(screen.getByTestId("set-delete-confirm"));

    await waitFor(() => expect(screen.getByTestId("set-lifecycle-message")).toHaveTextContent("Đã xoá 1/2 đề"));
    expect(mocks.deleteSet).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("bank-select-s2")).toBeChecked();
    expect(screen.getByTestId("bank-select-s1")).not.toBeChecked();
    expect(screen.queryByTestId("set-delete-confirm")).toBeNull();
  });

  it("lists archived sets on demand and offers Khôi phục instead of Lưu trữ", async () => {
    await open();

    await userEvent.selectOptions(screen.getByTestId("filter-status"), "archived");

    await waitFor(() => expect(screen.getByTestId("bank-card-a1")).toBeInTheDocument());
    expect(mocks.listSetsPage).toHaveBeenCalledWith(expect.objectContaining({ status: "archived" }));
    await userEvent.click(screen.getByTestId("bank-select-a1"));
    expect(screen.getByTestId("set-bulk-restore")).toBeInTheDocument();
    expect(screen.queryByTestId("set-bulk-archive")).toBeNull();
  });

  it("clears the selection when a filter changes", async () => {
    await open();

    await userEvent.click(screen.getByTestId("bank-select-s1"));
    expect(screen.getByTestId("set-bulk-bar")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByTestId("filter-skill"), "writing");

    expect(screen.queryByTestId("set-bulk-bar")).toBeNull();
  });

  it("keeps the selection when moving to another page", async () => {
    mocks.listSetsPage.mockImplementation((filter: { offset?: number }) =>
      Promise.resolve(filter.offset ? { items: [makeSet("p2")], total: 13 } : { items: SETS, total: 13 }),
    );
    await open();

    await userEvent.click(screen.getByTestId("bank-select-s1"));
    await userEvent.click(screen.getByTestId("page-next"));
    await waitFor(() => expect(screen.getByTestId("bank-card-p2")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("bank-select-p2"));

    expect(screen.getByTestId("set-bulk-bar")).toHaveTextContent("Đã chọn 2 đề");
  });

  it("selects every manageable set on the page at once", async () => {
    await open();

    await userEvent.click(screen.getByTestId("bank-select-page"));

    expect(screen.getByTestId("bank-select-s1")).toBeChecked();
    expect(screen.getByTestId("bank-select-s2")).toBeChecked();
    expect(screen.getByTestId("set-bulk-bar")).toHaveTextContent("Đã chọn 2 đề");
  });
});

describe("BanksPage list position", () => {
  it("opens on the page and filters in the URL", async () => {
    nav.set("status=draft&page=3");
    mocks.listSetsPage.mockResolvedValue({ items: SETS, total: 40 });
    await open();

    expect(mocks.listSetsPage).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", offset: 24 }));
    expect((screen.getByTestId("filter-status") as HTMLSelectElement).value).toBe("draft");
  });

  it("writes a page change to the URL and remembers it for the detail page's back button", async () => {
    mocks.listSetsPage.mockResolvedValue({ items: SETS, total: 40 });
    await open();

    await userEvent.click(screen.getByRole("button", { name: "2" }));

    expect(nav.replace).toHaveBeenLastCalledWith("/banks?page=2", { scroll: false });
    await waitFor(() => expect(mocks.listSetsPage).toHaveBeenCalledWith(expect.objectContaining({ offset: 12 })));
    expect(sessionStorage.getItem("banks:list-href")).toBe("/banks?page=2");
  });

  it("goes back to the first page when a filter changes", async () => {
    nav.set("page=3");
    mocks.listSetsPage.mockResolvedValue({ items: SETS, total: 40 });
    await open();

    await userEvent.selectOptions(screen.getByTestId("filter-skill"), "reading");

    expect(nav.replace).toHaveBeenLastCalledWith("/banks?skill=reading", { scroll: false });
  });
});
