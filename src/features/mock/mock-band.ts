// Pure band-recompute helpers for the MOCK teacher-review flow only.
// The backend does NOT recompute overall_band for the nested mock-result shape — it stores the
// LLM's own band — so after a teacher edits per-criterion bands the FE recomputes them here,
// following the rules the mock prompts score by:
//   - Speaking skill band  → floorHalf, the custom floor-half rule of `speaking_exam_high.md`
//                            (that prompt states it overrides standard IELTS rounding)
//   - Writing skill band   → roundHalf (nearest .5; Task 2 weighted double)
//   - Overall (4 skills)   → roundHalf (mean of 4 skills, nearest .5)
//
// NOT for the assignment review screen: that path scores by the criterion-average rule and has
// its own `features/review/criterion-band.ts`, which the backend recompute overwrites against.

import type { SpeakingResult, CriterionCode } from "@/features/partner/result-types";
import type { WritingResult, WritingCriterionCode } from "@/features/writing/writing-result-types";
import type { MockResultPayload } from "./mock-result-types";

const SPEAKING_CRITERIA: CriterionCode[] = ["FC", "LR", "GRA", "PRON"];
const WRITING_CRITERIA: WritingCriterionCode[] = ["TA_TR", "CC", "LR", "GRA"];

/** Round to nearest 0.5, clamped to [0, 9]. Writing skill band, and the 4-skill overall. */
export function roundHalf(x: number): number {
  const rounded = Math.round(x * 2) / 2;
  return Math.min(9, Math.max(0, rounded));
}

/** Round DOWN to nearest 0.5, clamped to [0, 9]. Mock Speaking skill band — mock only. */
export function floorHalf(x: number): number {
  return Math.min(9, Math.max(0, Math.floor(x * 2) / 2));
}

/**
 * True iff `result` is a multi-task Writing result (Task 1 + Task 2, the
 * normal shape for a full mock). Mirrors backend `taskMaps`: `multi_task`
 * must be truthy AND `tasks` must be a non-empty array. A flat single-task
 * Writing result instead carries its criteria directly at the top level and
 * has no `tasks`.
 */
export function writingIsMultiTask(result: WritingResult | null | undefined): boolean {
  return !!result && !!result.multi_task && Array.isArray(result.tasks) && result.tasks.length > 0;
}

/**
 * Combine weight of a writing task: Task 2 counts double. Detected via
 * `task_type` containing "2" when present; falls back to position (index >= 1
 * -> weight 2) when task_type is absent. Mirrors backend `taskWeight`.
 */
function taskWeight(task: WritingResult, index: number): number {
  if (typeof task.task_type === "string" && task.task_type.length > 0) {
    return task.task_type.includes("2") ? 2 : 1;
  }
  return index >= 1 ? 2 : 1;
}

/** Mean of the given criterion codes' bands, rounded with `round` (default roundHalf). null when none present. */
function meanCriterionBand(
  criteria: Record<string, { band?: unknown }> | undefined,
  codes: readonly string[],
  round: (n: number) => number = roundHalf,
): number | null {
  const bands: number[] = [];
  for (const code of codes) {
    const band = criteria?.[code]?.band;
    if (typeof band === "number" && Number.isFinite(band)) {
      bands.push(band);
    }
  }
  if (bands.length === 0) return null;
  const mean = bands.reduce((sum, b) => sum + b, 0) / bands.length;
  return round(mean);
}

/**
 * Recompute a skill's band.
 *
 * Speaking (flat): roundHalf(mean of FC/LR/GRA/PRON). Missing/non-numeric
 * criterion bands are skipped (not crashed on); if NO criterion has a valid
 * numeric band, returns 0.
 *
 * Writing multi-task (Task 1 + Task 2 — the normal shape for a full mock):
 * each task's own band is recomputed from its `criteria` (TA_TR/CC/LR/GRA)
 * and written back to `task.overall_band`; the skill band is the Task-2-weighted
 * combine of the two task bands, also written back to `result.overall_band`.
 * A task with no valid criteria contributes band 0 (not skipped — an
 * incomplete task must not silently vanish from the weighted mean).
 *
 * Writing flat (single-task, e.g. homework-style Writing without Task 1/2):
 * same criteria-mean logic as Speaking.
 */
export function recomputeSkillBand(
  result: SpeakingResult | WritingResult | null | undefined,
  skill: "speaking" | "writing",
): number {
  if (!result) return 0;
  if (skill === "writing" && writingIsMultiTask(result as WritingResult)) {
    const writing = result as WritingResult;
    const tasks = writing.tasks as WritingResult[];
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskBand = meanCriterionBand(
        task.criteria as Record<string, { band?: unknown }> | undefined,
        WRITING_CRITERIA,
      ) ?? 0;
      task.overall_band = taskBand;
      const weight = taskWeight(task, i);
      weightedSum += taskBand * weight;
      weightTotal += weight;
    }
    const skillBand = weightTotal > 0 ? roundHalf(weightedSum / weightTotal) : 0;
    writing.overall_band = skillBand;
    return skillBand;
  }

  // Flat: Speaking floors (exam_high rule); single-task Writing keeps nearest-half.
  const codes: readonly string[] = skill === "speaking" ? SPEAKING_CRITERIA : WRITING_CRITERIA;
  const round = skill === "speaking" ? floorHalf : roundHalf;
  return meanCriterionBand(result.criteria as Record<string, { band?: unknown }> | undefined, codes, round) ?? 0;
}

/**
 * Recompute the overall band as the arithmetic mean of the 4 skill bands,
 * rounded to the nearest 0.5 (roundHalf). Mirrors backend
 * `attempt.go roundIELTS = math.Round(avg*2)/2` so the FE-recomputed overall
 * (shown/stored when a teacher reviews) never drifts from the backend value.
 */
export function recomputeOverall(payload: MockResultPayload): number {
  const skills = payload.skills;
  const bands = [skills.reading.band, skills.listening.band, skills.speaking.band, skills.writing.band];
  const numeric = bands.map((b) => (typeof b === "number" && Number.isFinite(b) ? b : 0));
  const mean = numeric.reduce((sum, b) => sum + b, 0) / numeric.length;
  return roundHalf(mean);
}

function criteriaAllPresent(
  criteria: Record<string, { band?: unknown }> | undefined,
  codes: readonly string[],
): boolean {
  if (!criteria) return false;
  return codes.every((code) => {
    const band = criteria[code]?.band;
    return typeof band === "number" && Number.isFinite(band) && band > 0;
  });
}

function writingCriteriaComplete(result: WritingResult | undefined): boolean {
  if (!result) return false;
  if (writingIsMultiTask(result)) {
    return (result.tasks as WritingResult[]).every((task) =>
      criteriaAllPresent(task.criteria as Record<string, { band?: unknown }> | undefined, WRITING_CRITERIA),
    );
  }
  return criteriaAllPresent(result.criteria as Record<string, { band?: unknown }> | undefined, WRITING_CRITERIA);
}

/**
 * True iff every skill is fully scored and ready to release to the student:
 * Reading/Listening need a numeric band > 0; Speaking needs all of
 * FC/LR/GRA/PRON present (> 0); Writing needs all of TA_TR/CC/LR/GRA present
 * (> 0) — per task, when multi-task. A skill whose *mean* happens to be > 0
 * but is missing a criterion (e.g. teacher only filled 1 of 4) does NOT count
 * as complete — that's the whole point of gating: don't release a band the
 * teacher didn't actually finish scoring.
 */
export function mockScoresComplete(payload: MockResultPayload): boolean {
  const skills = payload.skills;
  // Reading/Listening are auto-graded objectively — "done" means a numeric band
  // exists (band 0.0 for 0 correct is a legitimate graded score, product rule),
  // NOT band > 0. Requiring > 0 would wrongly block approving a full_test where
  // the student scored zero on R/L.
  const objectiveOk = (["reading", "listening"] as const).every((skill) => {
    const band = skills[skill].band;
    return typeof band === "number" && Number.isFinite(band);
  });
  if (!objectiveOk) return false;

  const speakingResult = skills.speaking.result as SpeakingResult | undefined;
  const speakingOk =
    !!speakingResult &&
    criteriaAllPresent(speakingResult.criteria as Record<string, { band?: unknown }> | undefined, SPEAKING_CRITERIA);

  const writingOk = writingCriteriaComplete(skills.writing.result as WritingResult | undefined);

  return speakingOk && writingOk;
}
