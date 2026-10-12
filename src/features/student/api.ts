import { apiFetch } from "@/lib/api/client";
import type { ExamRules, ViolationType } from "../exam-rules/types";

export type StudentAssignment = {
  id: string;
  test_id: string;
  test_name?: string;
  skill?: string;
  tier?: string;
  duration_minutes?: number;
  time_limit_minutes?: number;
  teacher_name?: string;
  status: string;
  deadline?: string;
  created_at: string;
  purpose?: "practice" | "mock";
  origin: "assigned" | "self_practice";
  exam_rules?: ExamRules;
  grading_mode?: "ai" | "manual";
};

export type StudentAssignmentDetail = StudentAssignment;

export type AnswerItem = {
  sequence: number;
  audio_url?: string;
  essay_text?: string;
  /** Question prompt (HTML) resolved from the bank set; part number. */
  question_prompt?: string;
  part?: number;
};

export type StudentResult = {
  id: string;
  assignment_id?: string;
  submission_id: string;
  review_status: "pending" | "approved";
  band?: number;
  result: unknown;
  /** "speaking" | "writing" — the authoritative skill from the set. */
  skill?: string;
  answers: AnswerItem[];
  released_at?: string;
  created_at: string;
};

export type SubmitAnswerInput = {
  question_id: string;
  sequence: number;
  audio_url?: string;
  essay_text?: string;
};

export type StudentTestDetail = {
  id: string;
  name: string;
  skill: string;
  scoring_tier: string;
  status: string;
  questions: Array<{
    id: string;
    part: number;
    sequence: number;
    prompt: string;
    stimulus_url?: string;
    examiner_audio_url?: string;
    /**
     * Redacted reading/listening group metadata ({ audio_url?, groups: [...] }) — emitted by the
     * facade GET /student/tests/{id} for R/L sets, answer keys stripped server-side
     * (RedactForStudent). Absent/empty for speaking/writing.
     */
    metadata?: Record<string, unknown>;
  }>;
};

/** Response of POST /student/assignments/{id}/submit-objective (synchronous objective grade). */
export type SubmitObjectiveResponse = {
  /** "released" → auto-released (band present); "pending_review" → awaiting teacher release (band withheld). */
  status: "released" | "pending_review";
  band?: number;
  /** Released objective result id — the student is routed straight to its detail page (the answer key). */
  result_id?: string;
};

export type UploadURLsResponse = {
  upload_urls: Record<string, string>; // question_id -> presigned PUT URL
  upload_key_prefix: string;
};

export const studentAssignmentApi = {
  list: (params?: { origin?: "assigned" | "self_practice"; limit?: number }) =>
    apiFetch<StudentAssignment[]>("/student/assignments", {
      query: { origin: params?.origin, limit: params?.limit },
    }),
  get: (id: string) => apiFetch<StudentAssignmentDetail>(`/student/assignments/${id}`),
  getUploadURLs: (id: string) =>
    apiFetch<UploadURLsResponse>(`/student/assignments/${id}/upload-urls`),
  submit: (id: string, answers: SubmitAnswerInput[]) =>
    apiFetch<void>(`/student/assignments/${id}/submit`, { method: "POST", body: { answers } }),
  /**
   * Submits reading/listening answers for synchronous objective grading. The backend grades against
   * the set's live answer keys, persists a result, and applies the teacher-review gate — no async
   * job, no credit debit.
   */
  submitObjective: (id: string, body: { answers: { number: number; value: string[] }[] }) =>
    apiFetch<SubmitObjectiveResponse>(`/student/assignments/${id}/submit-objective`, {
      method: "POST",
      body,
    }),
  reportViolations: (id: string, events: { type: ViolationType; occurred_at?: string }[]) =>
    apiFetch<void>(`/student/assignments/${id}/violations`, { method: "POST", body: { events } }),
};

export const studentTestApi = {
  get: (id: string) => apiFetch<StudentTestDetail>(`/student/tests/${id}`),
};

export const studentResultApi = {
  list: () => apiFetch<StudentResult[]>("/student/results"),
  get: (id: string) => apiFetch<StudentResult>(`/student/results/${id}`),
};

export type Me = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
  name?: string;
  avatar_url?: string;
  preferred_language: string;
};

export const studentAccountApi = {
  me: () => apiFetch<Me>("/me"),
};

export const studentMediaApi = {
  presignUpload: (contentType: string) =>
    apiFetch<{ upload_url: string; public_url: string; key: string }>("/media/presign-upload", {
      method: "POST",
      body: { media_type: "audio", content_type: contentType },
    }),
};

export type PracticeSet = {
  id: string;
  name: string;
  skill: string;
  tier: string;
  duration_minutes?: number;
  target_band?: number;
  difficulty?: string;
  question_count: number;
  practice_enabled: boolean;
};

export const studentPracticeApi = {
  list: (skill?: string) => apiFetch<PracticeSet[]>("/student/practice/tests", { query: { skill } }),
  start: (setId: string) =>
    apiFetch<{ assignment_id: string }>(`/student/practice/tests/${setId}/start`, { method: "POST" }),
};
