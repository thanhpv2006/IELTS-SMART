// Pure helper logic for Reading/Listening (R/L) authoring: type descriptors,
// option resolution, answer-key reachability, and item-number utilities.
// No React, no side effects — safe to unit test in isolation.

import { parseOptionList, type RLGroupType } from "@novaforge-team/ielts-exam-engine";
import type { RLGroupDraft, RLItemDraft } from "./types";

export type RLTypeDescriptor = {
  type: RLGroupType;
  label: string;
  optionSource: "fixed" | "per_item" | "shared" | "none";
  fixedOptions?: string[];
  multiAnswer: boolean;
};

export const RL_TYPE_DESCRIPTORS: RLTypeDescriptor[] = [
  {
    type: "tfng",
    label: "Đúng/Sai/Không có (T/F/NG)",
    optionSource: "fixed",
    fixedOptions: ["TRUE", "FALSE", "NOT GIVEN"],
    multiAnswer: false,
  },
  {
    type: "ynng",
    label: "Có/Không/Không có (Y/N/NG)",
    optionSource: "fixed",
    fixedOptions: ["YES", "NO", "NOT GIVEN"],
    multiAnswer: false,
  },
  {
    type: "mcq_single",
    label: "Trắc nghiệm 1 đáp án",
    optionSource: "per_item",
    multiAnswer: false,
  },
  {
    type: "mcq_multi",
    label: "Trắc nghiệm nhiều đáp án",
    optionSource: "shared",
    multiAnswer: true,
  },
  {
    type: "gap_fill",
    label: "Điền từ vào chỗ trống",
    optionSource: "none",
    multiAnswer: false,
  },
  {
    type: "sentence_completion",
    label: "Hoàn thành câu",
    optionSource: "none",
    multiAnswer: false,
  },
  {
    type: "short_answer",
    label: "Trả lời ngắn",
    optionSource: "none",
    multiAnswer: false,
  },
  {
    type: "matching_headings",
    label: "Nối tiêu đề (i, ii, …)",
    optionSource: "shared",
    multiAnswer: false,
  },
  {
    type: "matching_info",
    label: "Nối thông tin (A, B, …)",
    optionSource: "shared",
    multiAnswer: false,
  },
  {
    type: "matching_features",
    label: "Nối đặc điểm (A, B, …)",
    optionSource: "shared",
    multiAnswer: false,
  },
  {
    type: "diagram_label",
    label: "Dán nhãn sơ đồ",
    optionSource: "none",
    multiAnswer: false,
  },
];

/** Look up the descriptor for a given R/L group type; falls back to a safe default. */
export function descriptorFor(type: RLGroupType): RLTypeDescriptor {
  const found = RL_TYPE_DESCRIPTORS.find((d) => d.type === type);
  if (found) return found;
  return { type, label: type, optionSource: "none", multiAnswer: false };
}

/** Resolve the effective option list for an item given its group's type. */
export function effectiveOptions(group: RLGroupDraft, item: RLItemDraft): string[] {
  const descriptor = descriptorFor(group.type);
  switch (descriptor.optionSource) {
    case "fixed":
      return descriptor.fixedOptions ?? [];
    case "shared":
      return group.shared_options ?? [];
    case "per_item":
      return item.options ?? [];
    case "none":
      return [];
    default:
      return [];
  }
}

/** Normalize an answer string for case/whitespace-insensitive comparison. */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Check whether an item's answer_key is reachable from its effective options.
 * Free-text items (no options, e.g. gap_fill / short_answer / diagram_label)
 * are exempt and always considered reachable.
 */
export function isItemReachable(group: RLGroupDraft, item: RLItemDraft): boolean {
  const opts = effectiveOptions(group, item);
  if (opts.length === 0) return true;
  const allowed = parseOptionList(opts).map((o) => normalizeAnswer(o.value));
  return item.answer_key.length > 0 && item.answer_key.every((k) => allowed.includes(normalizeAnswer(k)));
}

/** Create a blank item draft with the given number. */
export function emptyItem(number: number): RLItemDraft {
  return { number, prompt: "", answer_key: [] };
}

/** Create a blank group draft of the given type, seeded with one item. */
export function emptyGroup(type: RLGroupType): RLGroupDraft {
  return { type, items: [emptyItem(1)], _key: crypto.randomUUID() };
}

/** Compute the next sequential item number from a flat list of existing numbers. */
export function nextNumberFrom(nums: number[]): number {
  return Math.max(0, ...nums) + 1;
}

/** Compute the next sequential item number across all groups. */
export function nextNumber(groups: RLGroupDraft[]): number {
  return nextNumberFrom(groups.flatMap((g) => g.items.map((i) => i.number)));
}

/** Return item numbers that appear more than once across all groups (unique, ascending). */
export function duplicateNumbers(groups: RLGroupDraft[]): number[] {
  const counts = new Map<number, number>();
  for (const g of groups) {
    for (const item of g.items) {
      counts.set(item.number, (counts.get(item.number) ?? 0) + 1);
    }
  }
  const dupes = [...counts.entries()].filter(([, count]) => count > 1).map(([n]) => n);
  return dupes.sort((a, b) => a - b);
}
