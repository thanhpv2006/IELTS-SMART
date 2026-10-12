// Types for AI-assisted IELTS test import: pool upload -> classify -> confirm classification
// -> read + LLM draft -> human review -> confirm.
// Mirrors internal/catalog/port/http/ai_import_dto.go and internal/catalog/domain/ai_import.go
// in ielts-smart-backend.

export type AIImportStatus =
  | "queued"
  | "classifying"
  | "awaiting_confirm"
  | "extracting"
  | "generating"
  | "validating"
  | "ready_for_review"
  | "importing"
  | "done"
  | "failed";

// "unknown" is what the pool upload sends for every file: the customer does not classify
// anything, the backend does it from the content.
export type AIImportSourceKind =
  | "unknown"
  | "listening_paper"
  | "reading_paper"
  | "answer_doc"
  | "ws_doc"
  | "audio"
  | "image";

export type AIImportSourceFile = {
  kind: AIImportSourceKind;
  key: string;
  filename: string;
  content_type: string;
};

export type AIImportRegionRole =
  | "listening_paper"
  | "reading_paper"
  | "writing_task"
  | "speaking_part"
  | "answer_key"
  | "explanation"
  | "transcript"
  | "sample_answer"
  | "figure"
  | "audio"
  | "ignore";

// One stretch of an uploaded file with a single role — a customer's answer document routinely
// holds both skills' keys plus the transcript, so a file is not given one role of its own.
// PDFs locate a region by page range, text documents by character offset, audio by neither.
export type AIImportRegion = {
  role: AIImportRegionRole;
  skill: string;
  unit: number;
  source_key: string;
  page_from: number;
  page_to: number;
  char_from: number;
  char_to: number;
  confidence: "high" | "medium" | "low";
  evidence: string;
  source: "rubric" | "llm" | "human";
};

export type AIImportInventoryFile = {
  key: string;
  filename: string;
  content_type: string;
  bytes: number;
  sha256: string;
  pages: number;
  has_text_layer: boolean;
  duration_ms: number;
  duplicate_of: string;
  regions: AIImportRegion[];
};

export type AIImportAnswerRow = {
  number: number;
  answer_key: string[];
  accepted_variants: string[];
  explanation: string;
  source: string;
};

export type AIImportUnitRange = {
  unit: number;
  first: number;
  last: number;
};

export type AIImportAnswerTable = {
  listening: AIImportAnswerRow[];
  reading: AIImportAnswerRow[];
  units: Record<string, AIImportUnitRange[]>;
  normalized_by: string;
};

export type AIImportAuditFinding = {
  code: string;
  level: "warn" | "info";
  skill: string;
  question: number;
  message: string;
};

// skill/part stay plain string/number rather than the catalog's closed CatalogSkill union: an
// AI-generated or reviewer-edited draft can carry a value nothing has validated yet.
export type AIImportQuestionDraft = {
  skill: string;
  part: number;
  prompt: string; // HTML
  metadata: Record<string, unknown>;
};

export type AIImportResult = {
  slug: string;
  name: string;
  questions: AIImportQuestionDraft[];
  source_markdown: Record<string, string>;
};

export type AIImportJob = {
  id: string;
  owner_kind: string;
  partner_id?: string;
  slug: string;
  name: string;
  status: AIImportStatus;
  stage: string;
  model: string;
  source_files: AIImportSourceFile[];
  inventory: AIImportInventoryFile[];
  answer_table: AIImportAnswerTable;
  audit: AIImportAuditFinding[];
  classification_problems: AIImportAuditFinding[];
  result: AIImportResult;
  prompt_tokens: number;
  completion_tokens: number;
  question_set_id?: string;
  error?: string;
  created_at: string;
  updated_at: string;
};

// ─── Request bodies ────────────────────────────────────────────────────────

export type StartAIImportBody = {
  slug: string;
  name: string;
  files: AIImportSourceFile[];
};

export type UpdateAIImportResultBody = {
  result: AIImportResult;
};

export type ConfirmClassificationBody = {
  regions: AIImportRegion[];
};

export type AIImportJobFilter = {
  limit?: number;
  offset?: number;
};
