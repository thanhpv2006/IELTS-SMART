/**
 * IELTS criterion-average rounding — the rule the teacher-review path scores by.
 *
 * Mirrors backend `roundCriterionMean` (`internal/assignment/domain/band.go`), which is
 * authoritative: `SaveReview` always recomputes the skill band from the criteria and overwrites
 * whatever the client sent. A preview that rounds differently shows a band that will never be
 * stored — see `workflow/specs/scoring-prompts.md`.
 *
 * NOT the mock rule: full-test Speaking deliberately floors (`speaking_exam_high.md`), and the
 * assignment path is forbidden from borrowing it.
 */

/** `.00` keep whole · `.25` down to the whole · `.50` keep half · `.75` up to the next whole. */
export function roundCriterionMean(x: number): number {
  if (x < 0) return 0;
  const quarters = Math.round(x * 4);
  const whole = Math.floor(quarters / 4);
  const rest = quarters % 4;
  const band = rest === 2 ? whole + 0.5 : rest === 3 ? whole + 1 : whole;
  return Math.min(9, band);
}

/** The skill band of four criterion bands, or undefined while any is missing. */
export function criterionMeanBand(values: (number | undefined)[]): number | undefined {
  if (!values.every((v) => typeof v === "number" && v > 0)) return undefined;
  const nums = values as number[];
  return roundCriterionMean(nums.reduce((sum, v) => sum + v, 0) / nums.length);
}
