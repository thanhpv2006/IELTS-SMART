import { describe, it, expect } from "vitest";

import { resultScoreLabel } from "./score-label";

const objective = { kind: "objective", skill: "reading", raw: 9, total: 13, band: 3.5, sections: [] };
const mock = { skills: { reading: { band: 6 } }, overall_band: 6.5 };
const writing = { overall_band: 5.5, criteria: {} };

describe("resultScoreLabel", () => {
  it("shows the band for a mock full test", () => {
    expect(resultScoreLabel(mock, 6.5)).toBe("6.5");
  });

  it("shows correct/total for a Reading/Listening practice, never its band", () => {
    expect(resultScoreLabel(objective, 3.5)).toBe("9/13");
  });

  it("shows the band for a Writing/Speaking practice", () => {
    expect(resultScoreLabel(writing, 5.5)).toBe("5.5");
  });

  it("shows nothing for a mock whose band is not known yet", () => {
    expect(resultScoreLabel(mock, null)).toBeNull();
  });
});
