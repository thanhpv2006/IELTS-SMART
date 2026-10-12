// Pure mapping between the @novaforge-team/ielts-exam-engine SubmitPayload union and the
// backend's /fulltest-attempts/{id}/skills/{skill}/submit request bodies. No React, no fetch.

import type { SubmitPayload } from "@novaforge-team/ielts-exam-engine";
import type { ObjectiveAnswerBody, ScoredResponseBody } from "./types";

/**
 * Maps the engine's reading/listening SubmitPayload branch into the objective-skill submit body.
 */
export function engineToObjectiveBody(p: SubmitPayload): { answers: ObjectiveAnswerBody[] } {
  if (p.skill !== "reading" && p.skill !== "listening") {
    throw new Error("engineToObjectiveBody: expected a reading/listening SubmitPayload");
  }

  return {
    answers: p.answers.map((a) => ({ number: a.number, value: a.value })),
  };
}

/**
 * Maps the engine's speaking/writing SubmitPayload branch into the scored-skill submit body.
 *
 * audio_key (engine field name — object storage key returned by onUploadAudio) is remapped to
 * audio_url (backend field name), mirroring swSubmitToDTO in src/features/take/mapping.ts.
 */
export function engineToScoredBody(p: SubmitPayload): { responses: ScoredResponseBody[] } {
  if (p.skill !== "speaking" && p.skill !== "writing") {
    throw new Error("engineToScoredBody: expected a speaking/writing SubmitPayload");
  }

  return {
    responses: p.responses.map((a) => ({
      question_id: a.question_id,
      audio_url: a.audio_key,
      essay_text: a.essay_text,
    })),
  };
}
