export const JSON_IMPORT_SKILLS = ["listening", "reading", "writing", "speaking"] as const;
export type JSONImportSkill = (typeof JSON_IMPORT_SKILLS)[number];

export interface JSONImportFileInput {
  filename: string;
  skill: JSONImportSkill;
  content: unknown;
}

export interface JSONImportRequest {
  name: string;
  files: JSONImportFileInput[];
}

export interface JSONImportPlannedSet {
  title: string;
  kind: "full_test" | "practice";
  skill: string;
  part: number | null;
  question_count: number;
}

export interface JSONImportProblem {
  file: string;
  path: string;
  message: string;
}

export interface JSONImportMediaRef {
  file: string;
  pointer: string;
  value: string;
  local: boolean;
}

export interface JSONImportDraft {
  file: string;
  label: string;
  skill: string;
  part: number;
  prompt: string;
  metadata: Record<string, unknown>;
}

export interface JSONImportValidateResponse {
  plan: JSONImportPlannedSet[];
  problems: JSONImportProblem[];
  media_refs: JSONImportMediaRef[];
  drafts: JSONImportDraft[];
}

export interface JSONImportCreatedSet {
  id: string;
  title: string;
  kind: "full_test" | "practice";
  skill: string;
  question_count: number;
}

export interface JSONImportResult {
  sets: JSONImportCreatedSet[];
}

export interface PickedJSONFile {
  file: File;
  skill: JSONImportSkill | null;
  content: unknown;
  parseError: string | null;
}

export interface MediaMatch {
  ref: JSONImportMediaRef;
  file: File;
}
