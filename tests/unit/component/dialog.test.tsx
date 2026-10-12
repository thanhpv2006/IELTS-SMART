/**
 * Component tests for the Dialog component.
 * Covers CMP-06.
 *
 * Cases:
 *   CMP-06a — Dialog does not render when open=false.
 *   CMP-06b — Dialog renders title and children when open=true.
 *   CMP-06c — Pressing Escape key calls onClose.
 *   CMP-06d — Clicking the backdrop (overlay) calls onClose.
 *   CMP-06e — Clicking the X button calls onClose.
 *   CMP-06f — Dialog body is scrollable (overflow-y-auto applied).
 *   CMP-06g — DialogBody and DialogFooter render children.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";

// ─── CMP-06a: Closed by default ──────────────────────────────────────────────

describe("CMP-06a — Dialog does not render when open=false", () => {
  it("renders nothing when open is false", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Test">
        <span>content</span>
      </Dialog>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });
});

describe("CMP-06b — Dialog renders title and children when open=true", () => {
  it("renders the dialog with the provided title", () => {
    render(
      <Dialog open onClose={vi.fn()} title="Import giáo viên">
        <span>body text</span>
      </Dialog>
    );
    expect(screen.getByText("Import giáo viên")).toBeInTheDocument();
  });

  it("renders children inside the dialog", () => {
    render(
      <Dialog open onClose={vi.fn()} title="Test">
        <span data-testid="child">child content</span>
      </Dialog>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders optional description when provided", () => {
    render(
      <Dialog open onClose={vi.fn()} title="T" description="Mô tả chi tiết">
        <span />
      </Dialog>
    );
    expect(screen.getByText("Mô tả chi tiết")).toBeInTheDocument();
  });

  it("has role=dialog on the panel element", () => {
    render(
      <Dialog open onClose={vi.fn()} title="T">
        <span />
      </Dialog>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// ─── CMP-06c: Escape key closes dialog ───────────────────────────────────────

describe("CMP-06c — Pressing Escape calls onClose", () => {
  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <span />
      </Dialog>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose for non-Escape keys", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <span />
      </Dialog>
    );
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ─── CMP-06d: Backdrop click closes dialog ───────────────────────────────────

describe("CMP-06d — Clicking the backdrop overlay calls onClose", () => {
  it("calls onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <span />
      </Dialog>
    );
    // The backdrop is the aria-hidden div just before the panel.
    const backdrop = document.querySelector(".absolute.inset-0.bg-ink-900\\/50");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ─── CMP-06e: X button closes dialog ─────────────────────────────────────────

describe("CMP-06e — Clicking X button calls onClose", () => {
  it("calls onClose when the close (Đóng) button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <span />
      </Dialog>
    );
    await user.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ─── CMP-06f: Body has overflow-y-auto class ─────────────────────────────────

describe("CMP-06f — Dialog body is scrollable", () => {
  it("dialog body container has overflow-y-auto class", () => {
    render(
      <Dialog open onClose={vi.fn()} title="T">
        <span data-testid="inner">inner</span>
      </Dialog>
    );
    // The scrollable body wrapper wraps the children directly.
    const inner = screen.getByTestId("inner");
    const bodyWrapper = inner.parentElement;
    expect(bodyWrapper?.className).toContain("overflow-y-auto");
  });
});

// ─── CMP-06g: DialogBody / DialogFooter render children ──────────────────────

describe("CMP-06g — DialogBody and DialogFooter render children", () => {
  it("DialogBody renders children", () => {
    render(<DialogBody><span data-testid="db">db content</span></DialogBody>);
    expect(screen.getByTestId("db")).toBeInTheDocument();
  });

  it("DialogFooter renders children", () => {
    render(<DialogFooter><button>OK</button></DialogFooter>);
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });
});
