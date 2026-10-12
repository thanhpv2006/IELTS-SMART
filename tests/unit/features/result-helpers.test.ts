/**
 * Unit tests for pure result-layer helpers.
 * Sources:
 *   src/features/partner/result-view.tsx     — validPartLabel
 *   src/features/partner/result-errors-edit.tsx — flattenErrors, blankErr, buildErrorBlocks
 *
 * Case IDs:
 *   RES-07 — buildErrorBlocks (rebuild block structure from edited flat list)
 *   RES-08 — validPartLabel (filter "Part 0" / null labels)
 *   RES-09 — flattenErrors (flatten nested block→errors to editable list)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { validPartLabel } from "@/features/partner/result-view";
import { flattenErrors, blankErr, buildErrorBlocks } from "@/features/partner/result-errors-edit";

// ── validPartLabel — RES-08 ───────────────────────────────────────────────────

describe("validPartLabel — RES-08", () => {
  it("RES-08: returns null for null input", () => {
    expect(validPartLabel(null)).toBeNull();
  });

  it("RES-08: returns null for undefined input", () => {
    expect(validPartLabel(undefined)).toBeNull();
  });

  it("RES-08: returns null for empty string", () => {
    expect(validPartLabel("")).toBeNull();
  });

  it("RES-08: returns null for 'Part 0' (LLM emits when part field is 0)", () => {
    expect(validPartLabel("Part 0")).toBeNull();
  });

  it("RES-08: returns null for '0'", () => {
    expect(validPartLabel("0")).toBeNull();
  });

  it("RES-08: returns null for 'Part 0' with surrounding whitespace", () => {
    expect(validPartLabel("  Part 0  ")).toBeNull();
  });

  it("RES-08: returns trimmed label for valid 'Part 1'", () => {
    expect(validPartLabel("Part 1")).toBe("Part 1");
  });

  it("RES-08: returns trimmed label for 'Part 2' with whitespace", () => {
    expect(validPartLabel("  Part 2  ")).toBe("Part 2");
  });

  it("RES-08: returns trimmed label for 'Part 3'", () => {
    expect(validPartLabel("Part 3")).toBe("Part 3");
  });

  it("RES-08: any non-empty non-zero label is returned as-is (trimmed)", () => {
    expect(validPartLabel("  Task 1  ")).toBe("Task 1");
  });
});

// ── flattenErrors — RES-09 ────────────────────────────────────────────────────

// Reset the module-level sequence counter between tests is not possible
// without importing internals, so we just check structural invariants.

describe("flattenErrors — RES-09", () => {
  it("RES-09: returns empty array for undefined input", () => {
    expect(flattenErrors(undefined)).toEqual([]);
  });

  it("RES-09: returns empty array for empty blocks array", () => {
    expect(flattenErrors([])).toEqual([]);
  });

  it("RES-09: flattens a single block with two errors", () => {
    const blocks = [
      {
        errors: [
          { error_part: "I goes", correction: "I go", criterion_code: "GRA", error_type: "agreement", explanation: "SVA" },
          { error_part: "he go", correction: "he goes", criterion_code: "GRA", error_type: "agreement", explanation: "SVA" },
        ],
      },
    ];
    const result = flattenErrors(blocks);
    expect(result).toHaveLength(2);
    expect(result[0].bi).toBe(0);
    expect(result[1].bi).toBe(0);
    expect(result[0].error_part).toBe("I goes");
    expect(result[1].error_part).toBe("he go");
  });

  it("RES-09: assigns block index (bi) correctly across multiple blocks", () => {
    const blocks = [
      { errors: [{ error_part: "a" }] },
      { errors: [{ error_part: "b" }, { error_part: "c" }] },
    ];
    const result = flattenErrors(blocks);
    expect(result).toHaveLength(3);
    expect(result[0].bi).toBe(0);
    expect(result[1].bi).toBe(1);
    expect(result[2].bi).toBe(1);
  });

  it("RES-09: each EditErr has a unique _id string", () => {
    const blocks = [{ errors: [{ error_part: "x" }, { error_part: "y" }] }];
    const result = flattenErrors(blocks);
    const ids = result.map((e) => e._id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("RES-09: block with no errors array contributes 0 items", () => {
    const result = flattenErrors([{ errors: undefined }]);
    expect(result).toHaveLength(0);
  });
});

// ── blankErr ─────────────────────────────────────────────────────────────────

describe("blankErr", () => {
  it("returns an object with bi=-1 (teacher-added marker)", () => {
    const e = blankErr();
    expect(e.bi).toBe(-1);
  });

  it("returns empty strings for all text fields", () => {
    const e = blankErr();
    expect(e.error_part).toBe("");
    expect(e.correction).toBe("");
    expect(e.criterion_code).toBe("");
    expect(e.error_type).toBe("");
    expect(e.explanation).toBe("");
  });

  it("each call produces a unique _id", () => {
    const ids = Array.from({ length: 5 }, () => blankErr()._id);
    expect(new Set(ids).size).toBe(5);
  });
});

// ── buildErrorBlocks — RES-07 ─────────────────────────────────────────────────

describe("buildErrorBlocks — RES-07", () => {
  it("RES-07: empty edited list → original blocks with empty errors arrays", () => {
    const original = [{ part_label: "Part 1", errors: [{ error_part: "x" }] }];
    const result = buildErrorBlocks([], original);
    expect(result).toHaveLength(1);
    expect(result[0].errors).toHaveLength(0);
    // Preserves original block metadata
    expect((result[0] as { part_label?: string }).part_label).toBe("Part 1");
  });

  it("RES-07: edited error with bi=0 lands in block 0", () => {
    const original = [{ errors: [] }, { errors: [] }];
    const edited = [
      { _id: "e1", bi: 0, error_part: "foo", correction: "bar", criterion_code: "LR", error_type: "vocab", explanation: "wrong" },
    ];
    const result = buildErrorBlocks(edited, original);
    expect(result[0].errors).toHaveLength(1);
    expect(result[0].errors[0].error_part).toBe("foo");
    expect(result[1].errors).toHaveLength(0);
  });

  it("RES-07: edited error with bi=1 lands in block 1", () => {
    const original = [{ errors: [] }, { errors: [] }];
    const edited = [
      { _id: "e2", bi: 1, error_part: "bad", correction: "good", criterion_code: "GRA", error_type: "tense", explanation: "" },
    ];
    const result = buildErrorBlocks(edited, original);
    expect(result[0].errors).toHaveLength(0);
    expect(result[1].errors).toHaveLength(1);
    expect(result[1].errors[0].error_part).toBe("bad");
  });

  it("RES-07: teacher-added error (bi<0) is appended to block 0", () => {
    const original = [{ errors: [] }];
    const edited = [
      { _id: "t1", bi: -1, error_part: "added", correction: "fix", criterion_code: "FC", error_type: "fluency", explanation: "explain" },
    ];
    const result = buildErrorBlocks(edited, original);
    expect(result[0].errors).toHaveLength(1);
    expect(result[0].errors[0].error_part).toBe("added");
  });

  it("RES-07: when original is undefined, creates a single synthetic block", () => {
    const edited = [
      { _id: "e3", bi: -1, error_part: "z", correction: "w", criterion_code: "PRON", error_type: "p", explanation: "" },
    ];
    const result = buildErrorBlocks(edited, undefined);
    expect(result).toHaveLength(1);
    expect(result[0].errors).toHaveLength(1);
  });

  it("RES-07: output errors each have the required canonical fields", () => {
    const original = [{ errors: [] }];
    const edited = [
      { _id: "e4", bi: 0, error_part: "test", correction: "fixed", criterion_code: "LR", error_type: "vocab", explanation: "reason" },
    ];
    const [block] = buildErrorBlocks(edited, original);
    const err = block.errors[0];
    expect(err).toHaveProperty("error_part");
    expect(err).toHaveProperty("correction");
    expect(err).toHaveProperty("criterion_code");
    expect(err).toHaveProperty("error_type");
    expect(err).toHaveProperty("explanation");
    expect(err).toHaveProperty("criterion_name"); // always "" per impl
  });
});
