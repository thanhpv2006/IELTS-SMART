import { describe, it, expect } from "vitest";

import { resolveAssignedTimeLimitSeconds } from "@/features/take/exam-timing";

describe("resolveAssignedTimeLimitSeconds", () => {
  it.each([
    ["speaking", 25, undefined],
    ["reading", 25, 1500],
    ["listening", 40, 2400],
    ["writing", 25, 1500],
    ["reading", null, undefined],
    ["listening", undefined, undefined],
    ["writing", null, undefined],
  ] as const)("skill=%s assignmentMinutes=%s -> %s", (skill, assignmentMinutes, expected) => {
    expect(resolveAssignedTimeLimitSeconds({ skill, assignmentMinutes })).toBe(expected);
  });
});
