// Types for the nested B2B mock-result payload used in the teacher review UI.
// Unlike a flat single-skill result (SpeakingResult / WritingResult), a mock
// result nests all 4 skills under `skills` keyed by skill name, plus a
// backend-computed `overall_band` that the FE must recompute after edits
// (backend does not recompute for this nested shape — see mock-band.ts).

import type { SpeakingResult } from "@/features/partner/result-types";
import type { WritingResult } from "@/features/writing/writing-result-types";

export type MockSkillResult = {
  band: number | null;
  result: unknown;
};

export type MockResultPayload = {
  skills: Record<"reading" | "listening" | "speaking" | "writing", MockSkillResult>;
  overall_band: number;
};

/**
 * Structural guard: a mock result is a non-null object with a `skills` object
 * property — this is what distinguishes it from a flat single-skill result
 * (SpeakingResult / WritingResult), which has no `skills` key.
 */
export function isMockResult(r: unknown): r is MockResultPayload {
  if (typeof r !== "object" || r === null) return false;
  const skills = (r as Record<string, unknown>).skills;
  return typeof skills === "object" && skills !== null;
}

export function speakingPayload(r: MockResultPayload): SpeakingResult {
  return r.skills.speaking.result as SpeakingResult;
}

export function writingPayload(r: MockResultPayload): WritingResult {
  return r.skills.writing.result as WritingResult;
}
