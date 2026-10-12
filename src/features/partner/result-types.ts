// Result schema for exam_high / exam_mid / homework — the same shape as
// PartnerSpeakingResult trong speaking-demo (schema_version=v1).
// BE maps every prompt version to this shape before persisting.

export type CriterionCode = "FC" | "LR" | "GRA" | "PRON";

export interface SpeakingResult {
  schema_version?: string;
  overall_band?: number;
  overall_feedback?: OverallFeedback;
  criteria?: Partial<Record<CriterionCode, CriterionView>>;
  errors?: ErrorBlock[];
  clean_versions?: CleanItem[];
  outlier?: OutlierNotice;
  confidence?: ConfidenceBlock;
  is_stub?: boolean;
  /** Per-question transcript injected by the scoring sink (speaking). Matched to
   * answers by `sequence` — carries the real question prompt + spoken transcript. */
  _transcripts?: QuestionTranscript[];
}

export interface QuestionTranscript {
  sequence: number;
  question_prompt?: string;
  transcript?: string;
  audio_url?: string;
  words?: WordScore[];
}

/** One word's pronunciation score from SpeechSuper, as persisted by the scoring
 * sink. Despite the field names, `start_ms`/`end_ms` are centiseconds. */
export interface WordScore {
  word: string;
  score: number;
  start_ms: number;
  end_ms: number;
  level?: string;
}

export interface OverallFeedback {
  strengths?: string[];
  weaknesses?: string[];
  next_steps?: string[];
  final_band?: number;
}

export interface CriterionView {
  code?: string;
  name?: string;
  band?: number;
  comment?: string;
  strengths?: string[];
  weaknesses?: string[];
  issues?: string[];
  next_steps?: string[];
}

export interface ErrorBlock {
  part_label?: string | null;
  question?: string | null;
  /** Answer sequence this block corrects, echoed by the scorer (v1). Authoritative
   * key for mapping errors → answers; absent on results scored before the change. */
  sequence?: number;
  original_answer?: string;
  improved_answer?: string;
  errors?: ErrorItem[];
}

export interface ErrorItem {
  error_part?: string;
  criterion_code?: string;
  criterion_name?: string;
  error_type?: string;
  explanation?: string;
  correction?: string;
}

export interface CleanItem {
  part_label?: string | null;
  question?: string | null;
  clean_answer?: string;
}

export interface OutlierNotice {
  is_outlier?: boolean;
  band?: number | null;
  reason?: string | null;
}

export interface ConfidenceBlock {
  label?: string;
  raw_score?: number;
  recommendation?: {
    level?: string;
    gate_status?: string;
    message?: string;
  };
}
