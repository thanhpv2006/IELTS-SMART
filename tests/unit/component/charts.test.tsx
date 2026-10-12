/**
 * Component tests for DonutChart and StatCard.
 * Covers CMP-07.
 *
 * Cases:
 *   CMP-07a — DonutChart renders without crashing with empty data (no segments).
 *   CMP-07b — DonutChart renders without crashing with a single data point.
 *   CMP-07c — DonutChart renders centerValue and centerSub when provided.
 *   CMP-07d — StatCard renders label and value.
 *   CMP-07e — StatCard renders delta chip with up/down direction.
 *   CMP-07f — StatCard renders icon slot when icon is provided.
 *   CMP-07g — StatCard renders without delta/icon (minimal props) without crashing.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DonutChart, type DonutSegment } from "@/components/ui/donut-chart";
import { StatCard } from "@/components/ui/stat-card";

// Recharts uses ResizeObserver internally — provide a stub so jsdom does not
// throw "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe("CMP-07a — DonutChart renders without crash with empty data", () => {
  it("renders a container div with correct size", () => {
    const { container } = render(<DonutChart data={[]} size={120} />);
    const wrapper = container.querySelector(".relative");
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveStyle({ width: "120px", height: "120px" });
  });

  it("does not throw when data array is empty", () => {
    expect(() => render(<DonutChart data={[]} />)).not.toThrow();
  });
});

// ─── CMP-07b: DonutChart with single data point ───────────────────────────────

describe("CMP-07b — DonutChart renders without crash with a single segment", () => {
  const single: DonutSegment[] = [{ label: "Chờ đánh giá", value: 10, color: "#7F56D9" }];

  it("does not throw when data has one segment", () => {
    expect(() => render(<DonutChart data={single} />)).not.toThrow();
  });

  it("renders a wrapper container", () => {
    const { container } = render(<DonutChart data={single} />);
    expect(container.querySelector(".relative")).not.toBeNull();
  });
});

// ─── CMP-07c: DonutChart center text ─────────────────────────────────────────

describe("CMP-07c — DonutChart centerValue and centerSub render", () => {
  it("renders centerValue when provided", () => {
    render(<DonutChart data={[]} centerValue={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders centerSub when provided", () => {
    render(<DonutChart data={[]} centerSub="học viên" />);
    expect(screen.getByText("học viên")).toBeInTheDocument();
  });

  it("renders both centerValue and centerSub together", () => {
    render(<DonutChart data={[]} centerValue={5} centerSub="bài" />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("bài")).toBeInTheDocument();
  });

  it("does not render center overlay when neither is provided", () => {
    const { container } = render(<DonutChart data={[]} />);
    // No center overlay div should be present.
    const overlay = container.querySelector(".absolute.inset-0.flex");
    expect(overlay).toBeNull();
  });
});

describe("CMP-07d — StatCard renders label and value", () => {
  it("renders the label text", () => {
    render(<StatCard label="Tổng học viên" value={123} />);
    expect(screen.getByText("Tổng học viên")).toBeInTheDocument();
  });

  it("renders the value", () => {
    render(<StatCard label="Label" value={99} />);
    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("renders a React node as value", () => {
    render(
      <StatCard label="Label" value={<span data-testid="custom-val">8.0</span>} />
    );
    expect(screen.getByTestId("custom-val")).toBeInTheDocument();
  });
});

describe("CMP-07e — StatCard delta chip direction", () => {
  it("renders an up arrow (▲) for direction=up", () => {
    render(<StatCard label="L" value={1} delta={{ value: "5%", direction: "up" }} />);
    expect(screen.getByText(/▲/)).toBeInTheDocument();
  });

  it("renders a down arrow (▼) for direction=down", () => {
    render(<StatCard label="L" value={1} delta={{ value: "3%", direction: "down" }} />);
    expect(screen.getByText(/▼/)).toBeInTheDocument();
  });

  it("renders the delta value text", () => {
    render(<StatCard label="L" value={1} delta={{ value: "12%", direction: "up" }} />);
    expect(screen.getByText(/12%/)).toBeInTheDocument();
  });

  it("renders sub text alongside delta", () => {
    render(<StatCard label="L" value={1} delta={{ value: "5%", direction: "up" }} sub="so với tuần trước" />);
    expect(screen.getByText("so với tuần trước")).toBeInTheDocument();
  });
});

describe("CMP-07f — StatCard renders icon slot when provided", () => {
  it("renders the icon element", () => {
    render(
      <StatCard
        label="L"
        value={1}
        icon={<svg data-testid="icon" />}
        iconTone="brand"
      />
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

// ─── CMP-07g: StatCard minimal props ─────────────────────────────────────────

describe("CMP-07g — StatCard renders without optional props", () => {
  it("renders with only label and value (no icon, delta, sub)", () => {
    expect(() => render(<StatCard label="Minimal" value={0} />)).not.toThrow();
  });
});
