// Types for the platform catalog (shared question bank owned by admin,
// exposed to partners under /smart/catalog/*).

import type { RLGroupType } from "@novaforge-team/ielts-exam-engine";

export type CatalogSkill = "speaking" | "writing" | "reading" | "listening";
export type CatalogSetKind = "practice" | "homework" | "exam" | "full_test";
export type CatalogStatus = "draft" | "published" | "archived";
export type CatalogDifficulty = "easy" | "medium" | "hard";

export const SKILL_LABELS: Record<CatalogSkill, string> = {
  speaking: "Speaking",
  writing: "Writing",
  reading: "Reading",
  listening: "Listening",
};

export type CatalogQuestion = {
  id: string;
  skill: CatalogSkill;
  part: number;
  prompt: string; // HTML
  /** S/W keys: image_url?, examiner_audio_url?, task_type?, min_words? */
  metadata: Record<string, unknown>;
  category_id?: string;
  status: CatalogStatus;
  owner_kind: string;
  teacher_id?: string;
  created_at: string;
  updated_at: string;
};

export type CatalogQuestionSet = {
  id: string;
  title: string;
  description: string;
  kind: CatalogSetKind;
  status: CatalogStatus;
  skill?: CatalogSkill;
  /** The single Part every question shares. Absent on full_test and on legacy multi-Part sets. */
  part?: number;
  duration_minutes?: number;
  target_band?: number;
  difficulty?: CatalogDifficulty;
  practice_enabled: boolean;
  can_manage: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export type CatalogQuestionSetDetail = CatalogQuestionSet & {
  items: CatalogQuestion[];
};

export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  skill?: CatalogSkill;
  created_at: string;
};

export type CatalogImportResult = {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
};

// ─── Request bodies ────────────────────────────────────────────────────────

export type CreateCatalogQuestionBody = {
  skill: CatalogSkill;
  part: number;
  prompt: string;
  metadata: Record<string, unknown>;
  category_id?: string;
};

export type UpdateCatalogQuestionBody = {
  prompt: string;
  metadata: Record<string, unknown>;
  category_id?: string;
};

export type CreateCatalogSetBody = {
  title: string;
  kind: CatalogSetKind;
  skill?: CatalogSkill; // full_test has no skill
  duration_minutes?: number;
  target_band?: number;
  difficulty?: CatalogDifficulty;
};

export type UpdateCatalogSetBody = {
  title: string;
  description?: string;
  /** The set's own skill; without it the backend ignores duration_minutes, target_band and difficulty. */
  skill?: CatalogSkill;
  duration_minutes?: number;
  target_band?: number;
  difficulty?: CatalogDifficulty;
};

export type CreateCatalogCategoryBody = {
  slug: string;
  name: string;
  color?: string;
  icon?: string;
  sort_order?: number;
  skill?: CatalogSkill;
};

export type CatalogQuestionFilter = {
  skill?: CatalogSkill;
  part?: number;
  category_id?: string;
  status?: CatalogStatus;
  limit?: number;
  offset?: number;
};

export type CatalogSetFilter = {
  kind?: CatalogSetKind;
  status?: CatalogStatus;
  skill?: CatalogSkill;
  limit?: number;
  offset?: number;
};

// ─── Reading/Listening authoring draft types ──────────────────────────────
// Backend wire shape for R/L question metadata. `answer_key` is per-item and
// REQUIRED (single value except mcq_multi, which is a set of values).

export type RLItemDraft = {
  number: number;
  prompt?: string;
  options?: string[]; // per-item option list (mcq_single), e.g. ["A. ...","B. ..."]
  answer_key: string[]; // REQUIRED, non-empty; single value except mcq_multi (a set)
  accepted_variants?: string[]; // extra accepted strings for free-text types
  explanation?: string;
};

export type RLGroupDraft = {
  type: RLGroupType;
  section?: number; // listening display (1-4)
  instructions_html?: string;
  title?: string; // form-completion display heading, e.g. "Questions 1–7" (engine CompletionChrome heading)
  content_html?: string; // form-completion body: bảng/notes + <span data-blank="N">; tách khỏi instructions_html (rubric)
  image_url?: string; // diagram_label
  shared_options?: string[]; // group-level option bank (mcq_multi, matching_*)
  select_count?: number; // mcq_multi "Choose N": letters per question
  items: RLItemDraft[]; // non-empty
  _key?: string; // client-only stable React key; stripped before submit
};

export type RLMetadataDraft = {
  audio_url?: string; // listening, question-level
  groups: RLGroupDraft[]; // non-empty
  transcript?: string;
  passage_html_marked?: string;
};

export const RL_PARTS: Record<"reading" | "listening", number[]> = {
  reading: [1, 2, 3],
  listening: [1, 2, 3, 4],
};

export function partsForSkill(skill: CatalogSkill): number[] {
  switch (skill) {
    case "speaking":
      return [1, 2, 3];
    case "writing":
      return [1, 2];
    case "reading":
      return [1, 2, 3];
    case "listening":
      return [1, 2, 3, 4];
    default:
      return [1, 2, 3];
  }
}

// ─── Kind taxonomy helpers ─────────────────────────────────────────────────
// "homework" and "exam" are historical: sets created before a single-skill set was limited to
// one Part. They still arrive from the API and still render, but nothing creates them.

export function normalizeKind(raw: string): CatalogSetKind {
  switch (raw) {
    case "mock_exam":
      return "exam";
    case "practice":
    case "homework":
    case "exam":
    case "full_test":
      return raw;
    default:
      return "practice";
  }
}

// One Part per set means one cap per skill; the taller numbers only ever existed to fit a
// full-length exam across several Parts.
export const SKILL_ITEM_CAP: Record<CatalogSkill, number> = {
  speaking: 5,
  writing: 1,
  listening: 1,
  reading: 1,
};

// Speaking Part 2 is the one cue card of the interview, so a set on that Part holds a single
// question however many the skill allows elsewhere.
export function capFor(kind: CatalogSetKind, skill?: CatalogSkill, part?: number): number | null {
  if (kind === "full_test" || !skill) return null;
  if (skill === "speaking" && part === 2) return 1;
  return SKILL_ITEM_CAP[skill];
}

// Writing calls its Parts "Task", and the label is what a teacher scans a list by.
export function partLabel(skill: CatalogSkill | undefined, part: number): string {
  return skill === "writing" ? `Task ${part}` : `Part ${part}`;
}

export const SET_KIND_LABELS: Record<CatalogSetKind, string> = {
  practice: "Luyện tập",
  homework: "BTVN (cũ)",
  exam: "Đề thi (cũ)",
  full_test: "Full test",
};

// Temporary switch: hides the whole Full test feature from the UI.
// Set it back to `true` to bring it back (the full_test code below stays).
export const FULL_TEST_ENABLED = true;

// The list of kinds exposed to the UI (create form, filters…), respecting FULL_TEST_ENABLED.
export const VISIBLE_SET_KINDS: CatalogSetKind[] = FULL_TEST_ENABLED
  ? ["practice", "full_test"]
  : ["practice"];
