import { describe, it, expect } from "vitest";
import { criterionMeanBand, roundCriterionMean } from "./criterion-band";

// Measured against backend `recomputeOverall` (internal/assignment/domain/band.go) on the same
// inputs. The backend overwrites the band on save, so any drift here is a preview that lies.
const AGAINST_BACKEND: { criteria: number[]; band: number }[] = [
  { criteria: [6, 6, 6, 6], band: 6 },
  { criteria: [6, 6, 6, 6.5], band: 6 },
  { criteria: [6, 6, 6.5, 6.5], band: 6 },
  { criteria: [6, 6.5, 6.5, 6.5], band: 6.5 },
  { criteria: [6.5, 6.5, 6.5, 7], band: 7 },
  { criteria: [6.5, 6.5, 7, 7], band: 7 },
  { criteria: [6.5, 7, 7, 7], band: 7 },
  { criteria: [7, 7, 7, 7], band: 7 },
  { criteria: [5, 5, 5, 5], band: 5 },
  { criteria: [5, 5, 6, 6], band: 5.5 },
  { criteria: [6, 7, 7, 7], band: 7 },
];

describe("criterionMeanBand", () => {
  it.each(AGAINST_BACKEND)("$criteria → $band", ({ criteria, band }) => {
    expect(criterionMeanBand(criteria)).toBe(band);
  });

  it("is undefined until every criterion has a band", () => {
    expect(criterionMeanBand([6, 6, 6, undefined])).toBeUndefined();
    expect(criterionMeanBand([6, 6, 6, 0])).toBeUndefined();
  });

  it("never floors a .75 average the way the mock rule does", () => {
    // mock's floorHalf(6.75) is 6.5; the assignment path must not borrow that rule.
    expect(roundCriterionMean(6.75)).toBe(7);
    expect(roundCriterionMean(6.25)).toBe(6);
  });

  it("clamps to the band scale", () => {
    expect(roundCriterionMean(9)).toBe(9);
    expect(roundCriterionMean(-1)).toBe(0);
  });
});
