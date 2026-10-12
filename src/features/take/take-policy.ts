import type { ExamPolicy } from "@novaforge-team/ielts-exam-engine";

export type TakeSkill = "reading" | "listening" | "writing" | "speaking";

export type TakePolicyInput = {
  skill: TakeSkill | undefined;
  antiCheatRule: boolean;
  fullscreenRule: boolean;
  timeLimitSeconds?: number;
  speakingSpansParts: boolean;
};

export type TakePolicy = {
  reporterEnabled: boolean;
  policyOverrides: Partial<ExamPolicy>;
};

/**
 * Centre anti-cheat toggle applies to every skill, assigned or self-practice (design GC8). The
 * reporter stays on when fullscreen lockdown is enabled too, so exit-fullscreen events are still
 * reported even without anti-cheat (see useAntiCheatGuard).
 */
export function resolveTakePolicy(input: TakePolicyInput): TakePolicy {
  const { skill, antiCheatRule, fullscreenRule, timeLimitSeconds, speakingSpansParts } = input;
  const reporterEnabled = antiCheatRule || fullscreenRule;

  const policyOverrides: Partial<ExamPolicy> =
    skill === "reading" || skill === "listening" || skill === "writing"
      ? { timed: !!timeLimitSeconds, antiCheat: antiCheatRule }
      : { autoRecord: true, speakingPartIntro: speakingSpansParts, antiCheat: antiCheatRule };

  return { reporterEnabled, policyOverrides };
}
