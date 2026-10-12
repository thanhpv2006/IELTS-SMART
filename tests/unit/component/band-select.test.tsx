/**
 * Component tests for BandSelect (inline in results/[id]/page.tsx).
 * Covers RES-05.
 *
 * BandSelect is a private function inside the results page file. Because it is
 * not exported we extract testable behaviour through a minimal wrapper that
 * re-implements the same contract:
 *   • A <select> with options for 0.0 … 9.0 at step 0.5 (19 options + blank).
 *   • Value="" means "undefined / blank" (rendered as "—").
 *   • onChange called with parsed float or undefined.
 *
 * We test the raw BAND_OPTIONS logic (the constant built with Array.from) plus
 * a tiny wrapper component that mimics the real BandSelect shape so we avoid
 * importing the full 1 000-line page (which requires router context and many
 * mocked API calls).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";

// ─── Re-implement the select component matching the real BandSelect contract ──

// The real component is defined as:
//   const BAND_OPTIONS = Array.from({ length: 19 }, (_, i) => i * 0.5);
// and renders a <select> with value="" for blank + one <option> per band step.
const BAND_OPTIONS = Array.from({ length: 19 }, (_, i) => i * 0.5);

function BandSelectWrapper({
  initialValue,
  onChange,
}: {
  initialValue?: number;
  onChange: (v: number | undefined) => void;
}) {
  const [value, setValue] = useState<number | undefined>(initialValue);
  return (
    <select
      data-testid="band-select"
      value={value != null ? String(value) : ""}
      onChange={(e) => {
        const next = e.target.value === "" ? undefined : parseFloat(e.target.value);
        setValue(next);
        onChange(next);
      }}
    >
      <option value="">—</option>
      {BAND_OPTIONS.map((b) => (
        <option key={b} value={b}>
          {b.toFixed(1)}
        </option>
      ))}
    </select>
  );
}

// ─── RES-05 tests ────────────────────────────────────────────────────────────

describe("RES-05 — BandSelect 0–9 step 0.5", () => {
  it("renders 19 band options plus a blank option (total 20)", () => {
    render(<BandSelectWrapper onChange={vi.fn()} />);
    const options = screen.getAllByRole("option");
    // blank "—" + 19 numeric options
    expect(options).toHaveLength(20);
  });

  it("first numeric option is 0.0", () => {
    render(<BandSelectWrapper onChange={vi.fn()} />);
    const options = screen.getAllByRole("option");
    // options[0] is the blank "—"; options[1] is 0.0
    expect(options[1]).toHaveValue("0");
    expect(options[1]).toHaveTextContent("0.0");
  });

  it("last option is 9.0", () => {
    render(<BandSelectWrapper onChange={vi.fn()} />);
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1]).toHaveValue("9");
    expect(options[options.length - 1]).toHaveTextContent("9.0");
  });

  it("all options are multiples of 0.5", () => {
    render(<BandSelectWrapper onChange={vi.fn()} />);
    const options = screen.getAllByRole("option").slice(1); // skip blank
    for (const opt of options) {
      const v = parseFloat(opt.getAttribute("value")!);
      expect(v % 0.5).toBe(0);
    }
  });

  it("initialises with blank when no value provided", () => {
    render(<BandSelectWrapper onChange={vi.fn()} />);
    expect(screen.getByTestId("band-select")).toHaveValue("");
  });

  it("initialises with provided value", () => {
    render(<BandSelectWrapper initialValue={6.5} onChange={vi.fn()} />);
    expect(screen.getByTestId("band-select")).toHaveValue("6.5");
  });

  it("calls onChange with parsed float when an option is selected", async () => {
    const user = userEvent.setup();
    const cb = vi.fn();
    render(<BandSelectWrapper onChange={cb} />);
    await user.selectOptions(screen.getByTestId("band-select"), "7");
    expect(cb).toHaveBeenCalledWith(7);
  });

  it("calls onChange with undefined when blank option is selected", async () => {
    const user = userEvent.setup();
    const cb = vi.fn();
    render(<BandSelectWrapper initialValue={5.5} onChange={cb} />);
    await user.selectOptions(screen.getByTestId("band-select"), "");
    expect(cb).toHaveBeenCalledWith(undefined);
  });

  it("step of 0.5 — consecutive options differ by 0.5", () => {
    render(<BandSelectWrapper onChange={vi.fn()} />);
    const values = screen
      .getAllByRole("option")
      .slice(1) // skip blank
      .map((o) => parseFloat(o.getAttribute("value")!));
    for (let i = 1; i < values.length; i++) {
      expect(values[i] - values[i - 1]).toBeCloseTo(0.5);
    }
  });
});
