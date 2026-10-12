// Pure mapping between ielts-smart-web DTOs (student/catalog endpoints) and the
// @novaforge-team/ielts-exam-engine content/answer models. No React, no fetch — the engine
// contract this maps against is documented in
// workflow/changes/smart-take-exam-engine/design.md (§Global Constraints — "Engine contract").

import type { CatalogQuestion, Skill, SubmitPayload } from "@novaforge-team/ielts-exam-engine";
import type { StudentTestDetail, SubmitAnswerInput } from "@/features/student/api";

/**
 * Maps the flat student-assignment test DTO (speaking/writing take flow, GET
 * /student/tests/{id}) into the engine's CatalogQuestion[] shape.
 */
export function swQuestionsToCatalog(test: StudentTestDetail): CatalogQuestion[] {
  return test.questions.map((q) => ({
    id: q.id,
    skill: test.skill as Skill,
    part: q.part,
    prompt: q.prompt,
    metadata: {
      ...(q.stimulus_url ? { image_url: q.stimulus_url } : {}),
      ...(q.examiner_audio_url ? { examiner_audio_url: q.examiner_audio_url } : {}),
    },
  }));
}

/**
 * Normalizes catalog-endpoint question items (already near-engine shape, e.g. GET
 * /catalog/question-sets/{setId}) into CatalogQuestion[]. Written as an explicit field-by-field
 * pass-through (not a bare `return items`) so a future divergence between the catalog wire DTO
 * and CatalogQuestion is caught at this call site instead of being silently type-cast away.
 */
export function catalogItemsToQuestions(items: CatalogQuestion[]): CatalogQuestion[] {
  return items.map((item) => ({
    id: item.id,
    skill: item.skill,
    part: item.part,
    prompt: item.prompt,
    metadata: item.metadata,
  }));
}

/**
 * Maps the engine's speaking/writing SubmitPayload branch into the
 * POST /student/assignments/{id}/submit body shape (SubmitAnswerInput[]).
 *
 * audio_key (engine field name — object storage key returned by onUploadAudio) is remapped to
 * audio_url (existing BE field name for this endpoint; unchanged per design.md).
 *
 * IMPORTANT — iterates `test.questions` (NOT `payload.responses`) so the body always carries one
 * entry per question, including unanswered ones (empty audio_url/essay_text). The engine's
 * buildPayload() drops unanswered questions from `responses`; mapping over responses directly
 * would silently truncate the submission array. Reconstituting the full list preserves the
 * pre-engine wire shape the backend expects (one SubmitAnswerInput per test question).
 */
export function swSubmitToDTO(payload: SubmitPayload, test: StudentTestDetail): SubmitAnswerInput[] {
  if (!("responses" in payload)) {
    throw new Error("swSubmitToDTO: expected a speaking/writing SubmitPayload (with `responses`)");
  }

  const byQuestionId = new Map(payload.responses.map((r) => [r.question_id, r]));

  // Only emit rows for ANSWERED questions. The backend `assignment.answers` table has a
  // CHECK (audio_url IS NOT NULL OR essay_text IS NOT NULL), so a row for an unanswered question
  // (no audio + no essay) would fail the insert — breaking partial submits and hanging a fully
  // blank submit. A blank submit maps to [] here (backend records band 0 without a scoring job).
  return test.questions
    .map((q) => {
      const r = byQuestionId.get(q.id);
      return {
        question_id: q.id,
        sequence: q.sequence,
        audio_url: r?.audio_key,
        essay_text: r?.essay_text,
      };
    })
    .filter((a) => (a.audio_url != null && a.audio_url !== "") || (a.essay_text != null && a.essay_text !== ""));
}

/**
 * Maps the facade student-test DTO (GET /student/tests/{id}) for a reading/listening assignment into
 * the engine's CatalogQuestion[] shape. Each facade question already carries its redacted group
 * metadata ({ audio_url?, groups: [...] }, answer keys stripped server-side); the set-level skill is
 * authoritative (facade items have no per-item skill), so it is applied to every question.
 *
 * Mirrors catalogItemsToQuestions (which sources the stateless /catalog/question-sets/{id} demo path)
 * but reads from the flat StudentTestDetail carried by the assignment take flow.
 */
export function facadeRLToQuestions(test: StudentTestDetail): CatalogQuestion[] {
  return test.questions.map((q) => ({
    id: q.id,
    skill: test.skill as Skill,
    part: q.part,
    prompt: q.prompt,
    metadata: (q.metadata ?? {}) as CatalogQuestion["metadata"],
  }));
}

/**
 * Maps the engine's reading/listening SubmitPayload branch into the
 * POST /catalog/question-sets/{setId}/grade request body shape.
 */
export function rlSubmitToGrade(
  payload: SubmitPayload
): { skill: string; answers: { number: number; value: string[] }[] } {
  if (!("answers" in payload)) {
    throw new Error("rlSubmitToGrade: expected a reading/listening SubmitPayload (with `answers`)");
  }

  return {
    skill: payload.skill,
    answers: payload.answers.map((a) => ({ number: a.number, value: a.value })),
  };
}
