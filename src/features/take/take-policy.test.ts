import { describe, it, expect } from "vitest";

import { resolveTakePolicy, type TakeSkill } from "@/features/take/take-policy";

const SKILLS: TakeSkill[] = ["reading", "listening", "writing", "speaking"];

describe("resolveTakePolicy", () => {
  it.each(SKILLS)("skill=%s antiCheatRule=true -> overrides.antiCheat + reporterEnabled", (skill) => {
    const policy = resolveTakePolicy({
      skill,
      antiCheatRule: true,
      fullscreenRule: false,
      speakingSpansParts: false,
    });
    expect(policy.reporterEnabled).toBe(true);
    expect(policy.policyOverrides.antiCheat).toBe(true);
  });

  it.each(SKILLS)("skill=%s antiCheatRule=false, fullscreenRule=false -> antiCheat false, reporterEnabled false", (skill) => {
    const policy = resolveTakePolicy({
      skill,
      antiCheatRule: false,
      fullscreenRule: false,
      speakingSpansParts: false,
    });
    expect(policy.reporterEnabled).toBe(false);
    expect(policy.policyOverrides.antiCheat).toBe(false);
  });

  it("antiCheatRule=false, fullscreenRule=true -> reporterEnabled true", () => {
    const policy = resolveTakePolicy({
      skill: "reading",
      antiCheatRule: false,
      fullscreenRule: true,
      speakingSpansParts: false,
    });
    expect(policy.reporterEnabled).toBe(true);
  });

  it.each([true, false])("speaking keeps autoRecord and speakingPartIntro=%s from input", (spans) => {
    const policy = resolveTakePolicy({
      skill: "speaking",
      antiCheatRule: true,
      fullscreenRule: false,
      speakingSpansParts: spans,
    });
    expect(policy.policyOverrides.autoRecord).toBe(true);
    expect(policy.policyOverrides.speakingPartIntro).toBe(spans);
  });

  it("reading with timeLimitSeconds=1200 -> timed true", () => {
    const policy = resolveTakePolicy({
      skill: "reading",
      antiCheatRule: false,
      fullscreenRule: false,
      timeLimitSeconds: 1200,
      speakingSpansParts: false,
    });
    expect(policy.policyOverrides.timed).toBe(true);
  });

  it("writing without a time limit -> timed false", () => {
    const policy = resolveTakePolicy({
      skill: "writing",
      antiCheatRule: false,
      fullscreenRule: false,
      speakingSpansParts: false,
    });
    expect(policy.policyOverrides.timed).toBe(false);
  });

  it("skill=undefined does not throw and reporterEnabled follows the rules", () => {
    const policy = resolveTakePolicy({
      skill: undefined,
      antiCheatRule: true,
      fullscreenRule: false,
      speakingSpansParts: false,
    });
    expect(policy.reporterEnabled).toBe(true);
    expect(policy.policyOverrides.antiCheat).toBe(true);
  });
});
