/**
 * Component tests for AvatarInitials.
 * Covers CMP-08.
 *
 * Cases:
 *   CMP-08a — Single-word name → first 2 chars uppercased.
 *   CMP-08b — Multi-word name → first char of first word + first char of last word.
 *   CMP-08c — Empty string name → "?" fallback.
 *   CMP-08d — Whitespace-only string → "?" fallback.
 *   CMP-08e — Name with more than 2 words → first + last initial only.
 *   CMP-08f — Background colour is a non-empty CSS colour value.
 *   CMP-08g — Accepts size variants: sm, md (default), lg.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvatarInitials } from "@/components/ui/avatar-initials";

describe("CMP-08a — Single-word name yields 2 chars uppercased", () => {
  it("renders first 2 chars of a single-word name", () => {
    render(<AvatarInitials name="Alice" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("uppercases the characters", () => {
    render(<AvatarInitials name="bob" />);
    expect(screen.getByText("BO")).toBeInTheDocument();
  });

  it("works with a one-character name (returns that 1 char uppercased)", () => {
    render(<AvatarInitials name="X" />);
    expect(screen.getByText("X")).toBeInTheDocument();
  });
});

describe("CMP-08b — Two-word name yields first + last initial", () => {
  it("renders first char of first word and first char of last word", () => {
    render(<AvatarInitials name="Nguyễn Khánh" />);
    expect(screen.getByText("NK")).toBeInTheDocument();
  });

  it("uppercases both initials", () => {
    render(<AvatarInitials name="john doe" />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });
});

describe("CMP-08c — Empty string name returns '?' fallback", () => {
  it("renders '?' for an empty string", () => {
    render(<AvatarInitials name="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("CMP-08d — Whitespace-only string returns '?' fallback", () => {
  it("renders '?' for a string of spaces", () => {
    render(<AvatarInitials name="   " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("CMP-08e — Name with more than 2 words yields first + last initial only", () => {
  it("uses only the first and last word for initials", () => {
    render(<AvatarInitials name="Nguyễn Thị Bích Ngọc" />);
    // first = "N" from "Nguyễn", last = "N" from "Ngọc"
    expect(screen.getByText("NN")).toBeInTheDocument();
  });
});

describe("CMP-08f — Rendered element has a background color style", () => {
  it("applies a non-empty background style attribute", () => {
    render(<AvatarInitials name="Alice" />);
    // The component sets `style={{ background: "#xxxxxx" }}`.
    // jsdom computes the inline background as "rgb(r, g, b)" when read via
    // element.style.background, so we check for a non-empty colour value
    // in either hex or rgb format.
    const span = screen.getByText("AL");
    const bg = span.style.background;
    expect(bg).toBeTruthy();
    // Accept either #rrggbb or rgb(...) format.
    expect(bg).toMatch(/^(#[0-9A-Fa-f]{6}|rgb\(\d+,\s*\d+,\s*\d+\))$/);
  });

  it("different names produce potentially different colours (hash varies)", () => {
    // Two names that hash to different entries in the 7-colour COLORS pool.
    const { unmount } = render(<AvatarInitials name="Alice" />);
    const bg1 = screen.getByText("AL").style.background;
    unmount();

    render(<AvatarInitials name="Zara" />);
    const bg2 = screen.getByText("ZA").style.background;

    // Both should be non-empty colour values (hex or rgb).
    expect(bg1).toBeTruthy();
    expect(bg2).toBeTruthy();
  });
});

describe("CMP-08g — Size variants render without crash", () => {
  it("renders size='sm' without error", () => {
    render(<AvatarInitials name="Test" size="sm" />);
    expect(screen.getByText("TE")).toBeInTheDocument();
  });

  it("renders size='md' (default) without error", () => {
    render(<AvatarInitials name="Test" size="md" />);
    expect(screen.getByText("TE")).toBeInTheDocument();
  });

  it("renders size='lg' without error", () => {
    render(<AvatarInitials name="Test" size="lg" />);
    expect(screen.getByText("TE")).toBeInTheDocument();
  });
});
