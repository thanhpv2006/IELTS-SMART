// Synthesize `AnswerItem[]` from a mock S/W result (there is no separate `answers` table like
// a partner assignment) so the shared grading panels (SpeakingGradingPanel /
// WritingGradingPanel) can be reused in the Full Test review flow. The student's work
// lives in `result._transcripts[]` (speaking: audio_url + transcript; writing:
// transcript = the original essay), together with `question_prompt` (the prompt).

import type { AnswerItem } from "@/features/partner/api";
import type { SpeakingResult } from "@/features/partner/result-types";

type RawTranscript = {
  sequence?: unknown;
  audio_url?: unknown;
  transcript?: unknown;
  question_prompt?: unknown;
  part?: unknown;
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function answersFromMockSkill(result: unknown, skill: "speaking" | "writing"): AnswerItem[] {
  const transcripts = (result as SpeakingResult | undefined)?._transcripts;
  if (!Array.isArray(transcripts) || transcripts.length === 0) return [];

  return transcripts.map((raw, i): AnswerItem => {
    const t = (raw ?? {}) as RawTranscript;
    const answer: AnswerItem = {
      sequence: num(t.sequence, i),
      question_prompt: str(t.question_prompt),
    };
    if (skill === "speaking") {
      // Raw storage key at scoring time; the backend presigns it to a playable
      // GET URL when serving the mock result (see presignNestedAudio).
      const audio = str(t.audio_url);
      if (audio) answer.audio_url = audio;
      const part = t.part;
      if (typeof part === "number" && Number.isFinite(part)) answer.part = part;
    } else {
      // Writing: the transcript IS the student's original essay text. Empty
      // string still counts as "answered" so the panel shows the essay column.
      answer.essay_text = str(t.transcript);
    }
    return answer;
  });
}
