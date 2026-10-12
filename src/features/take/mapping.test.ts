import { describe, expect, it } from "vitest";
import type { SubmitPayload } from "@novaforge-team/ielts-exam-engine";
import type { StudentTestDetail } from "@/features/student/api";
import { swQuestionsToCatalog, swSubmitToDTO } from "./mapping";

// Regression: `assignment.answers` has CHECK (audio_url IS NOT NULL OR essay_text IS NOT NULL),
// so swSubmitToDTO must emit rows ONLY for answered questions — a blank submit maps to [], a
// partial submit maps to just the answered rows (never a null-only row that 500s the insert).
const test3q: StudentTestDetail = {
  id: "t1",
  name: "Speaking",
  skill: "speaking",
  scoring_tier: "exam",
  status: "published",
  questions: [
    { id: "q1", part: 1, sequence: 1, prompt: "Q1" },
    { id: "q2", part: 1, sequence: 2, prompt: "Q2" },
    { id: "q3", part: 1, sequence: 3, prompt: "Q3" },
  ],
};

describe("swSubmitToDTO", () => {
  it("empty speaking submit → [] (no null rows)", () => {
    const payload: SubmitPayload = { skill: "speaking", responses: [] };
    expect(swSubmitToDTO(payload, test3q)).toEqual([]);
  });

  it("partial speaking submit → only the answered rows", () => {
    const payload: SubmitPayload = {
      skill: "speaking",
      responses: [{ question_id: "q2", audio_key: "audio/q2.webm" }],
    };
    const out = swSubmitToDTO(payload, test3q);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ question_id: "q2", sequence: 2, audio_url: "audio/q2.webm" });
  });

  it("full speaking submit → one row per answered question", () => {
    const payload: SubmitPayload = {
      skill: "speaking",
      responses: [
        { question_id: "q1", audio_key: "a1" },
        { question_id: "q2", audio_key: "a2" },
        { question_id: "q3", audio_key: "a3" },
      ],
    };
    expect(swSubmitToDTO(payload, test3q)).toHaveLength(3);
  });
});

describe("swQuestionsToCatalog", () => {
  it("carries the examiner voice into engine metadata so ExaminerPrompt speaks instead of printing the question", () => {
    const withAudio: StudentTestDetail = {
      ...test3q,
      questions: [
        { id: "q1", part: 1, sequence: 1, prompt: "Q1", examiner_audio_url: "https://cdn.example.com/e1.mp3" },
        { id: "q2", part: 2, sequence: 2, prompt: "Q2", stimulus_url: "https://cdn.example.com/card.png" },
      ],
    };
    const out = swQuestionsToCatalog(withAudio);
    expect(out[0]!.metadata).toEqual({ examiner_audio_url: "https://cdn.example.com/e1.mp3" });
    expect(out[1]!.metadata).toEqual({ image_url: "https://cdn.example.com/card.png" });
  });
});
