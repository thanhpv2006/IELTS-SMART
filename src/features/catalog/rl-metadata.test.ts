/**
 * Unit tests for the pure R/L authoring helpers in ./rl-metadata.ts.
 * Locks down correctness-critical reachability / descriptor / numbering logic.
 */
import { describe, it, expect } from "vitest";
import {
  RL_TYPE_DESCRIPTORS,
  descriptorFor,
  effectiveOptions,
  isItemReachable,
  duplicateNumbers,
  nextNumberFrom,
  nextNumber,
} from "./rl-metadata";
import type { RLGroupDraft, RLItemDraft } from "./types";

describe("RL_TYPE_DESCRIPTORS / descriptorFor", () => {
  it("has exactly 11 descriptors", () => {
    expect(RL_TYPE_DESCRIPTORS.length).toBe(11);
  });

  it("tfng has fixed TRUE/FALSE/NOT GIVEN options", () => {
    expect(descriptorFor("tfng").fixedOptions).toEqual(["TRUE", "FALSE", "NOT GIVEN"]);
  });

  it("mcq_multi is a multi-answer type", () => {
    expect(descriptorFor("mcq_multi").multiAnswer).toBe(true);
  });

  it("gap_fill has no option source", () => {
    expect(descriptorFor("gap_fill").optionSource).toBe("none");
  });
});

// ── effectiveOptions ─────────────────────────────────────────────────────────

describe("effectiveOptions", () => {
  it("mcq_single: resolves per-item options", () => {
    const group: RLGroupDraft = { type: "mcq_single", items: [] };
    const item: RLItemDraft = {
      number: 1,
      options: ["A. x", "B. y"],
      answer_key: ["A"],
    };
    expect(effectiveOptions(group, item)).toEqual(["A. x", "B. y"]);
  });

  it("mcq_multi: resolves shared options regardless of item options", () => {
    const group: RLGroupDraft = {
      type: "mcq_multi",
      shared_options: ["A z", "B q"],
      items: [],
    };
    const item: RLItemDraft = {
      number: 1,
      options: ["ignored. option"],
      answer_key: ["A"],
    };
    expect(effectiveOptions(group, item)).toEqual(["A z", "B q"]);
  });

  it("gap_fill: has no options", () => {
    const group: RLGroupDraft = { type: "gap_fill", items: [] };
    const item: RLItemDraft = { number: 1, answer_key: ["answer"] };
    expect(effectiveOptions(group, item)).toEqual([]);
  });
});

// ── isItemReachable — via options ───────────────────────────────────────────

describe("isItemReachable — mcq_single", () => {
  const group: RLGroupDraft = { type: "mcq_single", items: [] };

  it("returns false when answer_key is not among the parsed option letters", () => {
    const item: RLItemDraft = {
      number: 1,
      options: ["A. Paris", "B. London"],
      answer_key: ["C"],
    };
    expect(isItemReachable(group, item)).toBe(false);
  });

  it("returns true when answer_key matches an option letter", () => {
    const item: RLItemDraft = {
      number: 1,
      options: ["A. Paris", "B. London"],
      answer_key: ["B"],
    };
    expect(isItemReachable(group, item)).toBe(true);
  });

  it("is case/space-insensitive", () => {
    const item: RLItemDraft = {
      number: 1,
      options: ["A. x", "B. y"],
      answer_key: ["b"],
    };
    expect(isItemReachable(group, item)).toBe(true);
  });
});

// ── isItemReachable — free-text exempt ──────────────────────────────────────

describe("isItemReachable — free-text (gap_fill)", () => {
  const group: RLGroupDraft = { type: "gap_fill", items: [] };

  it("is reachable when it has a non-empty answer_key and no options", () => {
    const item: RLItemDraft = { number: 2, answer_key: ["10"] };
    expect(isItemReachable(group, item)).toBe(true);
  });

  it("current behavior: an empty answer_key with no options is still reachable " +
    "(free-text items short-circuit on opts.length === 0 before checking answer_key; " +
    "empty-key validation is handled separately by the editor)", () => {
    const item: RLItemDraft = { number: 3, answer_key: [] };
    expect(isItemReachable(group, item)).toBe(true);
  });
});

// ── isItemReachable — mcq_multi (set) ───────────────────────────────────────

describe("isItemReachable — mcq_multi", () => {
  const group: RLGroupDraft = {
    type: "mcq_multi",
    shared_options: ["A a", "B b", "C c", "D d"],
    items: [],
  };

  it("returns true when every answer_key value is among the shared options", () => {
    const item: RLItemDraft = { number: 1, answer_key: ["A", "C"] };
    expect(isItemReachable(group, item)).toBe(true);
  });

  it("returns false when an answer_key value is not among the shared options", () => {
    const item: RLItemDraft = { number: 1, answer_key: ["E"] };
    expect(isItemReachable(group, item)).toBe(false);
  });
});

// ── isItemReachable — matching_headings (roman numerals) ────────────────────

describe("isItemReachable — matching_headings", () => {
  const group: RLGroupDraft = {
    type: "matching_headings",
    shared_options: ["i First", "ii Second", "iii Third"],
    items: [],
  };

  it("returns true when answer_key matches a roman numeral option", () => {
    const item: RLItemDraft = { number: 1, answer_key: ["ii"] };
    expect(isItemReachable(group, item)).toBe(true);
  });

  it("returns false when answer_key does not match any roman numeral option", () => {
    const item: RLItemDraft = { number: 1, answer_key: ["iv"] };
    expect(isItemReachable(group, item)).toBe(false);
  });
});

// ── duplicateNumbers ─────────────────────────────────────────────────────────

describe("duplicateNumbers", () => {
  it("returns numbers that appear more than once across groups", () => {
    const groups: RLGroupDraft[] = [
      {
        type: "gap_fill",
        items: [
          { number: 1, answer_key: ["a"] },
          { number: 2, answer_key: ["b"] },
        ],
      },
      {
        type: "gap_fill",
        items: [
          { number: 2, answer_key: ["c"] },
          { number: 3, answer_key: ["d"] },
        ],
      },
    ];
    expect(duplicateNumbers(groups)).toEqual([2]);
  });

  it("returns an empty array when all numbers are unique", () => {
    const groups: RLGroupDraft[] = [
      {
        type: "gap_fill",
        items: [
          { number: 1, answer_key: ["a"] },
          { number: 2, answer_key: ["b"] },
        ],
      },
    ];
    expect(duplicateNumbers(groups)).toEqual([]);
  });
});

// ── nextNumber / nextNumberFrom ──────────────────────────────────────────────

describe("nextNumberFrom / nextNumber", () => {
  it("nextNumberFrom([]) starts at 1", () => {
    expect(nextNumberFrom([])).toBe(1);
  });

  it("nextNumberFrom returns max + 1", () => {
    expect(nextNumberFrom([1, 4, 2])).toBe(5);
  });

  it("nextNumber computes across all groups", () => {
    const groups: RLGroupDraft[] = [
      {
        type: "gap_fill",
        items: [
          { number: 1, answer_key: ["a"] },
          { number: 2, answer_key: ["b"] },
        ],
      },
      {
        type: "gap_fill",
        items: [{ number: 5, answer_key: ["c"] }],
      },
    ];
    expect(nextNumber(groups)).toBe(6);
  });
});
