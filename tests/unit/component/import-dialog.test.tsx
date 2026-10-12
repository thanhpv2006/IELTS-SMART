/**
 * Component tests for ImportDialog.
 * Covers CMP-01.
 *
 * Cases:
 *   CMP-01a — Dialog renders title and column description.
 *   CMP-01b — "Tải file mẫu" link renders when templateHref is provided.
 *   CMP-01c — Selecting a file triggers the importFn mutation.
 *   CMP-01d — Success result shows imported count.
 *   CMP-01e — Error from mutation shows error message.
 *   CMP-01f — Clicking "Đóng" calls onClose.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ImportResult } from "@/features/partner/api";
import { ImportDialog } from "@/features/partner/import-dialog";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const DEFAULT_PROPS = {
  title: "Import giáo viên",
  columns: <span>Cột: Email, Họ tên</span>,
  importFn: vi.fn<[File], Promise<ImportResult>>(),
  invalidateKeys: [["teachers"]],
  onClose: vi.fn(),
};

describe("CMP-01a — ImportDialog renders title and column description", () => {
  it("shows the provided title", () => {
    render(<ImportDialog {...DEFAULT_PROPS} />, { wrapper: makeWrapper() });
    expect(screen.getByText("Import giáo viên")).toBeInTheDocument();
  });

  it("shows the column description", () => {
    render(<ImportDialog {...DEFAULT_PROPS} />, { wrapper: makeWrapper() });
    expect(screen.getByText("Cột: Email, Họ tên")).toBeInTheDocument();
  });
});

describe("CMP-01b — Template download link", () => {
  it("renders 'Tải file mẫu' link when templateHref is provided", () => {
    render(
      <ImportDialog {...DEFAULT_PROPS} templateHref="/templates/teachers.xlsx" />,
      { wrapper: makeWrapper() }
    );
    const link = screen.getByRole("link", { name: /tải file mẫu/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/templates/teachers.xlsx");
  });

  it("does not render template link when templateHref is omitted", () => {
    render(<ImportDialog {...DEFAULT_PROPS} />, { wrapper: makeWrapper() });
    expect(screen.queryByRole("link", { name: /tải file mẫu/i })).not.toBeInTheDocument();
  });
});

// ─── CMP-01c: File selection triggers importFn ───────────────────────────────

describe("CMP-01c — Selecting a file triggers importFn", () => {
  it("calls importFn with the selected File object", async () => {
    const user = userEvent.setup();
    const importFn = vi.fn<[File], Promise<ImportResult>>().mockResolvedValue({
      imported: 3,
      skipped: 0,
      errors: [],
      generated_passwords: [],
    });
    render(
      <ImportDialog {...DEFAULT_PROPS} importFn={importFn} />,
      { wrapper: makeWrapper() }
    );

    const file = new File(["col1,col2"], "teachers.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    // TanStack Query useMutation passes (variables, context) to mutationFn;
    // assert only that the first argument is the correct File.
    await waitFor(() => expect(importFn).toHaveBeenCalledOnce());
    expect(importFn.mock.calls[0][0]).toBe(file);
  });
});

describe("CMP-01d — Success result shows imported count", () => {
  it("shows success count after import completes", async () => {
    const user = userEvent.setup();
    const importFn = vi.fn<[File], Promise<ImportResult>>().mockResolvedValue({
      imported: 5,
      skipped: 1,
      errors: [],
      generated_passwords: [],
    });
    render(
      <ImportDialog {...DEFAULT_PROPS} importFn={importFn} />,
      { wrapper: makeWrapper() }
    );

    const file = new File(["x"], "teachers.xlsx", { type: "application/octet-stream" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByText(/5 thành công/i)).toBeInTheDocument());
    expect(screen.getByText(/1 bỏ qua/i)).toBeInTheDocument();
  });

  it("shows row-level errors when result contains errors", async () => {
    const user = userEvent.setup();
    const importFn = vi.fn<[File], Promise<ImportResult>>().mockResolvedValue({
      imported: 2,
      skipped: 0,
      errors: [{ row: 3, reason: "Email đã tồn tại" }],
      generated_passwords: [],
    });
    render(
      <ImportDialog {...DEFAULT_PROPS} importFn={importFn} />,
      { wrapper: makeWrapper() }
    );

    const file = new File(["x"], "teachers.xlsx", { type: "application/octet-stream" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(screen.getByText(/Dòng 3: Email đã tồn tại/i)).toBeInTheDocument()
    );
  });
});

describe("CMP-01e — importFn rejection shows error message", () => {
  it("shows error text when importFn rejects", async () => {
    const user = userEvent.setup();
    const importFn = vi.fn<[File], Promise<ImportResult>>().mockRejectedValue(
      new Error("File không hợp lệ")
    );
    render(
      <ImportDialog {...DEFAULT_PROPS} importFn={importFn} />,
      { wrapper: makeWrapper() }
    );

    const file = new File(["x"], "bad.xlsx", { type: "application/octet-stream" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(screen.getByText(/File không hợp lệ/i)).toBeInTheDocument()
    );
  });
});

describe("CMP-01f — Clicking Đóng calls onClose", () => {
  it("calls onClose when Đóng button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ImportDialog {...DEFAULT_PROPS} onClose={onClose} />,
      { wrapper: makeWrapper() }
    );

    // The Dialog renders two "Đóng" elements: the X icon button (aria-label)
    // and the footer "Đóng" text button. Select the footer button by text.
    const closeBtns = screen.getAllByRole("button", { name: /đóng/i });
    // Footer button is the last one (the X is in the header, footer is appended last).
    await user.click(closeBtns[closeBtns.length - 1]);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
