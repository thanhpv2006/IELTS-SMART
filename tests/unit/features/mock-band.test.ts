/**
 * Unit tests for pure band-recompute helpers.
 * Source: src/features/mock/mock-band.ts
 */
import { describe, it, expect } from "vitest";
import { roundHalf, recomputeSkillBand, recomputeOverall, mockScoresComplete, writingIsMultiTask } from "@/features/mock/mock-band";
import type { SpeakingResult } from "@/features/partner/result-types";
import type { WritingResult } from "@/features/writing/writing-result-types";
import type { MockResultPayload } from "@/features/mock/mock-result-types";

function fullSpeakingResult(): SpeakingResult {
  return { criteria: { FC: { band: 6 }, LR: { band: 6 }, GRA: { band: 6 }, PRON: { band: 6 } } };
}

function fullWritingTask(): WritingResult {
  return { criteria: { TA_TR: { band: 6 }, CC: { band: 6 }, LR: { band: 6 }, GRA: { band: 6 } } };
}

// ── roundHalf ────────────────────────────────────────────────────────────────

describe("roundHalf", () => {
  it("6.24 rounds down to 6.0 (6.24*2=12.48 -> round 12 -> 6.0)", () => {
    expect(roundHalf(6.24)).toBe(6.0);
  });

  it("6.25 rounds up to 6.5", () => {
    expect(roundHalf(6.25)).toBe(6.5);
  });

  it("6.75 rounds up to 7.0", () => {
    expect(roundHalf(6.75)).toBe(7.0);
  });

  it("clamps values above 9 down to 9", () => {
    expect(roundHalf(9.5)).toBe(9);
  });

  it("clamps values below 0 up to 0", () => {
    expect(roundHalf(-1)).toBe(0);
  });
});

// ── recomputeSkillBand ───────────────────────────────────────────────────────

describe("recomputeSkillBand", () => {
  it("speaking: mean of FC/LR/GRA/PRON = 6,7,6,7 -> 6.5", () => {
    const result: SpeakingResult = {
      criteria: {
        FC: { band: 6 },
        LR: { band: 7 },
        GRA: { band: 6 },
        PRON: { band: 7 },
      },
    };
    expect(recomputeSkillBand(result, "speaking")).toBe(6.5);
  });

  it("returns 0 when no criteria present", () => {
    const result: SpeakingResult = {};
    expect(recomputeSkillBand(result, "speaking")).toBe(0);
  });

  it("skips missing/non-numeric criterion bands instead of crashing", () => {
    const result: SpeakingResult = {
      criteria: {
        FC: { band: 6 },
        LR: { band: 8 },
        // GRA missing, PRON missing
      },
    };
    // mean of [6, 8] -> 7
    expect(recomputeSkillBand(result, "speaking")).toBe(7);
  });

  it("writing flat (single-task): mean of TA_TR/CC/LR/GRA = 6,6,7,7 -> 6.5", () => {
    const result: WritingResult = {
      criteria: { TA_TR: { band: 6 }, CC: { band: 6 }, LR: { band: 7 }, GRA: { band: 7 } },
    };
    expect(recomputeSkillBand(result, "writing")).toBe(6.5);
  });
});

// ── recomputeSkillBand — writing multi-task (Task 1 + Task 2) ────────────────

describe("recomputeSkillBand — writing multi-task", () => {
  it("Task1 mean 5.0, Task2 mean 6.0 (weight 2) -> weighted (5*1+6*2)/3 = 5.667 -> roundHalf -> 5.5", () => {
    const result: WritingResult = {
      multi_task: true,
      tasks: [
        { task_type: "Task1", criteria: { TA_TR: { band: 5 }, CC: { band: 5 }, LR: { band: 5 }, GRA: { band: 5 } } },
        { task_type: "Task2", criteria: { TA_TR: { band: 6 }, CC: { band: 6 }, LR: { band: 6 }, GRA: { band: 6 } } },
      ],
    };
    expect(recomputeSkillBand(result, "writing")).toBe(5.5);
    // side effects: each task's own overall_band + the skill's overall_band are written back
    expect(result.tasks?.[0].overall_band).toBe(5);
    expect(result.tasks?.[1].overall_band).toBe(6);
    expect(result.overall_band).toBe(5.5);
  });

  it("falls back to index-based Task 2 weighting when task_type is absent", () => {
    const result: WritingResult = {
      multi_task: true,
      tasks: [
        { criteria: { TA_TR: { band: 5 }, CC: { band: 5 }, LR: { band: 5 }, GRA: { band: 5 } } },
        { criteria: { TA_TR: { band: 6 }, CC: { band: 6 }, LR: { band: 6 }, GRA: { band: 6 } } },
      ],
    };
    expect(recomputeSkillBand(result, "writing")).toBe(5.5);
  });

  it("a task with no valid criteria contributes band 0 rather than being skipped from the mean", () => {
    const result: WritingResult = {
      multi_task: true,
      tasks: [
        { task_type: "Task1", criteria: { TA_TR: { band: 8 }, CC: { band: 8 }, LR: { band: 8 }, GRA: { band: 8 } } },
        { task_type: "Task2" }, // no criteria at all
      ],
    };
    // weighted (8*1 + 0*2) / 3 = 2.667 -> roundHalf -> 2.5
    expect(recomputeSkillBand(result, "writing")).toBe(2.5);
  });
});

// ── writingIsMultiTask ───────────────────────────────────────────────────────

describe("writingIsMultiTask", () => {
  it("true when multi_task is set and tasks is non-empty", () => {
    expect(writingIsMultiTask({ multi_task: true, tasks: [fullWritingTask()] })).toBe(true);
  });

  it("false for a flat single-task writing result", () => {
    expect(writingIsMultiTask({ criteria: {} })).toBe(false);
  });

  it("false when multi_task is set but tasks is missing or empty", () => {
    expect(writingIsMultiTask({ multi_task: true })).toBe(false);
    expect(writingIsMultiTask({ multi_task: true, tasks: [] })).toBe(false);
  });
});

// ── recomputeOverall ─────────────────────────────────────────────────────────

describe("recomputeOverall", () => {
  it("mean of 4 skill bands 6.5/6/6.5/6 -> 6.25 -> roundHalf -> 6.5", () => {
    const payload: MockResultPayload = {
      overall_band: 0,
      skills: {
        reading: { band: 6.5, result: {} },
        listening: { band: 6, result: {} },
        speaking: { band: 6.5, result: {} },
        writing: { band: 6, result: {} },
      },
    };
    expect(recomputeOverall(payload)).toBe(6.5);
  });
});

// ── mockScoresComplete ───────────────────────────────────────────────────────
// Gate is stricter than "band > 0": Speaking/Writing must have EVERY required
// criterion filled (not just a mean > 0), because a teacher who only filled
// 1 of 4 criteria could otherwise get a false "complete" via a lucky mean.

describe("mockScoresComplete", () => {
  it("true when R/L have a band and Speaking/Writing (flat) have all 4 criteria filled", () => {
    const payload: MockResultPayload = {
      overall_band: 6.5,
      skills: {
        reading: { band: 6.5, result: {} },
        listening: { band: 6, result: {} },
        speaking: { band: 6.5, result: fullSpeakingResult() },
        writing: { band: 6, result: fullWritingTask() },
      },
    };
    expect(mockScoresComplete(payload)).toBe(true);
  });

  it("false when Speaking is missing one criterion, even though its stored band is > 0", () => {
    const payload: MockResultPayload = {
      overall_band: 0,
      skills: {
        reading: { band: 6.5, result: {} },
        listening: { band: 6, result: {} },
        speaking: {
          band: 6.5,
          result: { criteria: { FC: { band: 6 }, LR: { band: 6 }, GRA: { band: 6 } } }, // PRON missing
        },
        writing: { band: 6, result: fullWritingTask() },
      },
    };
    expect(mockScoresComplete(payload)).toBe(false);
  });

  it("false when one objective skill's band is null", () => {
    const payload: MockResultPayload = {
      overall_band: 0,
      skills: {
        reading: { band: 6.5, result: {} },
        listening: { band: null, result: {} },
        speaking: { band: 6.5, result: fullSpeakingResult() },
        writing: { band: 6, result: fullWritingTask() },
      },
    };
    expect(mockScoresComplete(payload)).toBe(false);
  });

  it("false when one objective skill's band is 0", () => {
    const payload: MockResultPayload = {
      overall_band: 0,
      skills: {
        reading: { band: 6.5, result: {} },
        listening: { band: 0, result: {} },
        speaking: { band: 6.5, result: fullSpeakingResult() },
        writing: { band: 6, result: fullWritingTask() },
      },
    };
    expect(mockScoresComplete(payload)).toBe(false);
  });

  it("multi-task writing: false when Task 2 is missing a criterion", () => {
    const payload: MockResultPayload = {
      overall_band: 0,
      skills: {
        reading: { band: 6.5, result: {} },
        listening: { band: 6, result: {} },
        speaking: { band: 6.5, result: fullSpeakingResult() },
        writing: {
          band: 6,
          result: {
            multi_task: true,
            tasks: [
              fullWritingTask(),
              { criteria: { TA_TR: { band: 6 }, CC: { band: 6 }, LR: { band: 6 } } }, // GRA missing
            ],
          } satisfies WritingResult,
        },
      },
    };
    expect(mockScoresComplete(payload)).toBe(false);
  });

  it("multi-task writing: true when every task has all 4 criteria filled", () => {
    const payload: MockResultPayload = {
      overall_band: 6.5,
      skills: {
        reading: { band: 6.5, result: {} },
        listening: { band: 6, result: {} },
        speaking: { band: 6.5, result: fullSpeakingResult() },
        writing: {
          band: 6,
          result: { multi_task: true, tasks: [fullWritingTask(), fullWritingTask()] } satisfies WritingResult,
        },
      },
    };
    expect(mockScoresComplete(payload)).toBe(true);
  });
});
