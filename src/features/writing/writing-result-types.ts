export type WritingCriterionCode = "TA_TR" | "CC" | "LR" | "GRA";

export interface WritingResult {
  schema_version?: string;
  task_type?: string; // "Task1" | "Task2"
  overall_band?: number;
  // Multi-task (Mock: Task 1 + Task 2). When set, `tasks` holds per-task
  // results and `overall_band` is the IELTS-weighted combined band.
  multi_task?: boolean;
  tasks?: WritingResult[];
  word_count?: WordCount;
  criteria?: Partial<Record<WritingCriterionCode, WritingCriterionView>>;
  errors?: WritingErrorBlock[];
  clean_essay?: string;
  positive_bias?: PositiveBias;
  outlier?: WritingOutlierNotice;
  is_stub?: boolean;
}

export interface WordCount {
  detected: number;
  required: number;
  missing: number;
  length_tier: string; // "A" | "B" | "C" | "D" | "E"
  length_impact?: string | null;
}

export interface WritingCriterionView {
  code?: string;
  name?: string;
  band?: number;
  comment?: string;
  strengths?: string[];
  weaknesses?: string[];
  issues?: string[];
  next_steps?: string[];
}

export interface WritingErrorBlock {
  sentence_index: number;
  original_sentence: string;
  corrected_sentence: string;
  errors: WritingErrorItem[];
}

export interface WritingErrorItem {
  error_part: string;
  criterion_code: string;
  criterion_name: string;
  error_type: string;
  explanation: string;
  correction: string;
}

export interface PositiveBias {
  applied: boolean;
  reason: string | null;
  bonus: number;
}

export interface WritingOutlierNotice {
  is_outlier?: boolean;
  band?: number | null;
  reason?: string | null;
}
