import type { Skill } from "@novaforge-team/ielts-exam-engine";

// Standard IELTS section time limits (seconds) shared by the exam-mode taking
// surfaces (single-skill assignment take/[id] + mock full-test). Reading = 60'
// paper time; Listening ~31' (audio + review) matching the mock defaults; Speaking
// has no total cap (the engine manages per-part timing via speakingTiming).
export const SKILL_TIME_LIMITS: Record<Skill, number | undefined> = {
  reading: 3600,
  listening: 1860,
  writing: 3600,
  speaking: undefined,
};

// The assignment's own limit is the only source: a teacher who leaves it empty means untimed.
// Assignments made before per-assignment limits got the centre limit copied in by a migration.
export function resolveAssignedTimeLimitSeconds(args: {
  skill: string | undefined;
  assignmentMinutes?: number | null;
}): number | undefined {
  const { skill, assignmentMinutes } = args;
  if (skill === "speaking" || !assignmentMinutes) return undefined;
  return assignmentMinutes * 60;
}
