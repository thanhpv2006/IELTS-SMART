/**
 * Unit tests for the engine → backend submit-body mapping used by the B2B mock take flow
 * (src/features/mock/mapping.ts). Redaction-critical: this is the only place `audio_key`
 * (engine field) gets renamed to `audio_url` (backend field) before hitting
 * /fulltest-attempts/{id}/skills/{skill}/submit.
 */
import { describe, it, expect } from "vitest";
import { engineToObjectiveBody, engineToScoredBody } from "@/features/mock/mapping";

describe("engineToObjectiveBody", () => {
  it("passes reading/listening answers through unchanged", () => {
    const result = engineToObjectiveBody({
      skill: "reading",
      answers: [{ number: 1, value: ["A"] }],
    });
    expect(result).toEqual({ answers: [{ number: 1, value: ["A"] }] });
  });

  it("throws when given a speaking/writing payload", () => {
    expect(() =>
      engineToObjectiveBody({
        skill: "speaking",
        responses: [{ question_id: "q1", audio_key: "k1" }],
      })
    ).toThrow();
  });
});

describe("engineToScoredBody", () => {
  it("renames audio_key to audio_url for speaking responses", () => {
    const result = engineToScoredBody({
      skill: "speaking",
      responses: [{ question_id: "q1", audio_key: "k1" }],
    });
    expect(result).toEqual({
      responses: [{ question_id: "q1", audio_url: "k1", essay_text: undefined }],
    });
  });

  it("keeps essay_text for writing responses", () => {
    const result = engineToScoredBody({
      skill: "writing",
      responses: [{ question_id: "q2", essay_text: "hello" }],
    });
    expect(result).toEqual({
      responses: [{ question_id: "q2", audio_url: undefined, essay_text: "hello" }],
    });
  });

  it("throws when given a reading/listening payload", () => {
    expect(() =>
      engineToScoredBody({
        skill: "reading",
        answers: [{ number: 1, value: ["A"] }],
      })
    ).toThrow();
  });
});
