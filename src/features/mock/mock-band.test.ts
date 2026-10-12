/**
 * Unit tests for the pure band-recompute helpers in ./mock-band.ts.
 * Locks down the overall-band rounding rule: mean of the 4 skills rounded to
 * the NEAREST 0.5 (roundHalf), mirroring backend roundIELTS — NOT rounded up.
 */
import { describe, it, expect } from "vitest";
import { roundHalf, floorHalf, recomputeOverall } from "./mock-band";
import type { MockResultPayload } from "./mock-result-types";

function payload(reading: number, listening: number, speaking: number, writing: number): MockResultPayload {
  const skill = (band: number) => ({ band, result: {} });
  return {
    skills: { reading: skill(reading), listening: skill(listening), speaking: skill(speaking), writing: skill(writing) },
    overall_band: 0,
  };
}

describe("roundHalf", () => {
  it("rounds to nearest 0.5, half up", () => {
    expect(roundHalf(0.875)).toBe(1);
    expect(roundHalf(6.25)).toBe(6.5);
    expect(roundHalf(6.1)).toBe(6);
    expect(roundHalf(5.5)).toBe(5.5);
  });
});

describe("floorHalf", () => {
  it("rounds down to nearest 0.5", () => {
    expect(floorHalf(6.4)).toBe(6);
    expect(floorHalf(6.75)).toBe(6.5);
  });
});

describe("recomputeOverall", () => {
  it("is the mean of 4 skills rounded to nearest .5 (screenshot case)", () => {
    // 0 + 0 + 2.5 + 1 = 3.5 → mean 0.875 → 1.0
    expect(recomputeOverall(payload(0, 0, 2.5, 1))).toBe(1);
  });

  it("rounds DOWN when mean is below the .25 threshold (proves not ceil)", () => {
    // 6 + 6 + 6 + 6.4 = 24.4 → mean 6.1 → nearest .5 = 6.0 (ceilHalf would give 6.5)
    expect(recomputeOverall(payload(6, 6, 6, 6.4))).toBe(6);
  });

  it("rounds up at the .25 boundary", () => {
    // 6 + 6 + 6 + 7 = 25 → mean 6.25 → 6.5
    expect(recomputeOverall(payload(6, 6, 6, 7))).toBe(6.5);
  });

  it("treats non-numeric skill bands as 0", () => {
    const p = payload(5, 5, 5, 5);
    // @ts-expect-error — simulate a missing/ungraded skill band
    p.skills.writing.band = null;
    // 5 + 5 + 5 + 0 = 15 → mean 3.75 → 4.0
    expect(recomputeOverall(p)).toBe(4);
  });
});
