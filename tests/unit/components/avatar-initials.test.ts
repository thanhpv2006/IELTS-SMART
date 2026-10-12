/**
 * Unit tests for avatar-initials pure logic helpers.
 * Source: src/components/ui/avatar-initials.tsx
 *
 * Case ID: CMP-08 — avatar initials generator logic.
 *
 * Tests only the pure functions (initials + colorFor),
 * NOT the React component itself.
 */
import { describe, it, expect } from "vitest";
import { initials, colorFor } from "@/components/ui/avatar-initials";

// COLORS array defined in source (kept in sync manually):
const COLORS = ["#7F56D9", "#175CD3", "#067647", "#B54708", "#155EEF", "#0E7090", "#C11574"];

// ── initials — CMP-08 ────────────────────────────────────────────────────────

describe("initials — CMP-08", () => {
  it("CMP-08: single name → first 2 chars uppercased", () => {
    expect(initials("Linh")).toBe("LI");
  });

  it("CMP-08: two words → first char of each word uppercased", () => {
    expect(initials("Trần Linh")).toBe("TL");
  });

  it("CMP-08: three words → first char of first + first char of last", () => {
    expect(initials("Nguyễn Văn An")).toBe("NA");
  });

  it("CMP-08: extra whitespace between words is ignored", () => {
    expect(initials("Trần   Linh")).toBe("TL");
  });

  it("CMP-08: leading/trailing whitespace is trimmed", () => {
    expect(initials("  An  ")).toBe("AN");
  });

  it("CMP-08: single uppercase letter name → just that char repeated (slice 0,2)", () => {
    expect(initials("A")).toBe("A"); // single char: slice(0,2) = "A"
  });

  it("CMP-08: empty string (after trim) → '?'", () => {
    expect(initials("")).toBe("?");
  });

  it("CMP-08: whitespace-only string → '?'", () => {
    expect(initials("   ")).toBe("?");
  });

  it("CMP-08: result is always uppercase", () => {
    const result = initials("anna nguyen");
    expect(result).toBe(result.toUpperCase());
  });

  it("CMP-08: two-word name where first part is multi-char → first chars only", () => {
    // "Nguyễn Linh" → "N" + "L" = "NL"
    expect(initials("Nguyễn Linh")).toBe("NL");
  });
});

// ── colorFor — CMP-08 ────────────────────────────────────────────────────────

describe("colorFor — CMP-08", () => {
  it("CMP-08: returns a hex color string", () => {
    const color = colorFor("Nguyễn Linh");
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("CMP-08: color is always one of the COLORS palette", () => {
    const names = ["Alice", "Bob", "Charlie", "Delta", "Echo", "Foxtrot", "Golf"];
    names.forEach((name) => {
      expect(COLORS).toContain(colorFor(name));
    });
  });

  it("CMP-08: same name always returns same color (deterministic)", () => {
    const name = "Trần Mỹ Linh";
    expect(colorFor(name)).toBe(colorFor(name));
  });

  it("CMP-08: different names can produce different colors", () => {
    // Just check that the function doesn't always return the same colour.
    const colors = new Set(["Alice", "Bob", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"].map(colorFor));
    // With 7 palette slots and 8 names it is mathematically impossible for all to collide.
    expect(colors.size).toBeGreaterThan(1);
  });

  it("CMP-08: empty string returns a valid palette color", () => {
    expect(COLORS).toContain(colorFor(""));
  });
});
