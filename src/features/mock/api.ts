import { apiFetch } from "@/lib/api/client";
import type {
  AssignMockInput,
  AssignMockResult,
  MockAttempt,
  MockSet,
  MockSkill,
  ObjectiveAnswerBody,
  ScoredResponseBody,
} from "./types";

type MockSetListResponse = {
  items: MockSet[];
};

export const mockApi = {
  listMockSets: () =>
    apiFetch<MockSetListResponse>("/catalog/question-sets", {
      query: { kind: "full_test", status: "published" },
    }).then((res) => res.items),

  assignMock: (setId: string, input: AssignMockInput) =>
    apiFetch<AssignMockResult>(`/smart/mock/${setId}/assign`, {
      method: "POST",
      body: { student_ids: input.student_ids, class_id: input.class_id, deadline: input.deadline },
    }),

  startMock: (assignmentId: string) =>
    apiFetch<MockAttempt>(`/student/assignments/${assignmentId}/start-mock`, {
      method: "POST",
    }),

  // Per-skill score is redacted from the student UI for B2B mock (surfaces only via teacher
  // review), so we deliberately discard the sync response and return void here.
  submitObjectiveSkill: (attemptId: string, skill: MockSkill, answers: ObjectiveAnswerBody[]) =>
    apiFetch<void>(`/fulltest-attempts/${attemptId}/skills/${skill}/submit`, {
      method: "POST",
      body: { answers },
    }),

  submitScoredSkill: (
    attemptId: string,
    skill: MockSkill,
    responses: ScoredResponseBody[],
    voiceSample?: string | null,
  ) =>
    apiFetch<void>(`/fulltest-attempts/${attemptId}/skills/${skill}/submit`, {
      method: "POST",
      body: voiceSample ? { responses, voice_sample: voiceSample } : { responses },
    }),
};
