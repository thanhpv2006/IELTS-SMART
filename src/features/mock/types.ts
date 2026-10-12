// Types for the B2B full-test mock flow: catalog full-test sets, assignment to
// students, and the multi-skill attempt (reading/listening/speaking/writing) it spawns.
//
// Enum unions mirror the backend source of truth (internal/mock/domain/enums.go).

export type MockSkill = "reading" | "listening" | "speaking" | "writing";
export type MockSkillStatus = "not_started" | "submitted" | "scoring" | "completed" | "failed";
export type MockAttemptStatus = "awaiting_payment" | "in_progress" | "completed" | "refunded" | "expired";
export type MockVariant = "academic" | "general";
export type MockRevealMode = "per_skill" | "at_end";

export type MockSet = {
  id: string;
  title: string;
  kind: "full_test";
  status: string;
  item_count: number;
  created_at: string;
};

// Backend DTOs use `*T json:",omitempty"` for these fields — nil pointers are OMITTED from
// the JSON payload (e.g. when redacted or not yet scored), so they surface as `undefined` at
// runtime, not `null`.
export type MockSkillState = {
  skill: MockSkill;
  status: MockSkillStatus;
  raw_score?: number;
  band?: number;
  result?: unknown;
};

export type MockAttempt = {
  attempt_id: string;
  set_id: string;
  variant: MockVariant;
  status: MockAttemptStatus;
  reveal_mode: MockRevealMode;
  overall_band?: number;
  skills: MockSkillState[];
  /** Per-center policy resolved server-side (backend port layer); absent/false for B2C. */
  fullscreen?: boolean;
};

export type AssignMockInput = {
  student_ids: string[];
  class_id?: string;
  deadline?: string;
};

export type AssignMockResult = {
  ids: string[];
};

// Request-body shapes for skill submit endpoints, hoisted here (rather than left inline in
// api.ts/mapping.ts) so both files share a single source of truth and cannot drift.
export type ObjectiveAnswerBody = { number: number; value: string[] };
export type ScoredResponseBody = { question_id: string; audio_url?: string; essay_text?: string };
