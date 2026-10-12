/**
 * Unit tests for levelToBand() helper
 * Source: src/app/(partner)/students/page.tsx
 *
 * Case ID: STU-05 — map trình độ string → numeric band for API payload.
 */
import { describe, it, expect } from "vitest";
import { levelToBand } from "@/app/(partner)/students/page";

describe("levelToBand — STU-05", () => {
  // Standard IELTS band labels used in LEVEL_OPTIONS
  it("STU-05: extracts 5.5 from 'Band 5.5'", () => {
    expect(levelToBand("Band 5.5")).toBe(5.5);
  });

  it("STU-05: extracts 6.0 from 'Band 6.0'", () => {
    expect(levelToBand("Band 6.0")).toBe(6.0);
  });

  it("STU-05: extracts 4.5 from 'Band 4.5'", () => {
    expect(levelToBand("Band 4.5")).toBe(4.5);
  });

  it("STU-05: extracts 7.0 from 'Band 7.0'", () => {
    expect(levelToBand("Band 7.0")).toBe(7.0);
  });

  it("STU-05: extracts integer band from 'Band 5'", () => {
    expect(levelToBand("Band 5")).toBe(5);
  });

  it("STU-05: returns undefined for 'Foundation' (no digits)", () => {
    expect(levelToBand("Foundation")).toBeUndefined();
  });

  it("STU-05: returns undefined for 'Giao tiếp' (no digits)", () => {
    expect(levelToBand("Giao tiếp")).toBeUndefined();
  });

  it("STU-05: returns undefined for empty string", () => {
    expect(levelToBand("")).toBeUndefined();
  });

  it("STU-05: picks the first numeric group from arbitrary string", () => {
    // e.g. user-entered free text with a number
    expect(levelToBand("Target: 6.5 band")).toBe(6.5);
  });

  it("STU-05: handles integer-only label without decimal", () => {
    // 'Band 6.0' vs 'Band 6' — both should parse correctly
    expect(levelToBand("Band 6")).toBe(6);
  });
});
