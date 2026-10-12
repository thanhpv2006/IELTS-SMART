import { apiFetch } from "@/lib/api/client";
import type { CatalogSetKind, CatalogSkill } from "@/features/catalog/types";
import type { SpeakingFraudBlock } from "@/features/review/speaking-fraud";
import type { ExamRules } from "../exam-rules/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StudentClass = {
  id: string;
  name: string;
};

export type Student = {
  user_id: string;
  display_name: string;
  email?: string;
  avatar_url?: string;
  phone?: string;
  teacher_id?: string;
  /** N-N: the list of active classes. Empty = not placed in a class yet. */
  classes: StudentClass[];
  current_level?: string;
  current_band?: number;
  assignment_done: number;
  assignment_total: number;
  credit_limit: number | null;
  credits_used: number;
  /** This calendar month's seat allowance per pool; absent when the centre has no contract. */
  quota_limit?: Record<string, number>;
  quota_used?: Record<string, number>;
  created_at: string;
};

export type Teacher = {
  user_id: string;
  display_name: string;
  email: string;
  phone?: string;
  status?: "active" | "inactive";
  specializations?: string[];
  student_count: number;
  assignments_this_month: number;
  submission_rate: number;
  last_active_at?: string;
  created_at?: string;
};

export type DailyItem = {
  day: string;
  submitted: number;
  pending: number;
  overdue: number;
};

export type DailyAIScoringItem = {
  day: string;
  avg_ms: number | null;
};

export type OwnerDashboard = {
  teacher_count: number;
  student_total: number;
  student_assigned: number;
  student_unassigned: number;
  assignments_this_range: number;
  assignments_prev_range: number;
  pending_count: number;
  overdue_count: number;
  submission_rate: number;
  avg_ai_scoring_ms?: number;
  /** Legacy pool only. Read credit_balances for what the centre can actually
   *  spend — pools do not convert, so they must never be summed. */
  credit_balance: number;
  credit_balances: Record<CreditUnitType, number>;
  credits_used_in_range: number;
  from: string;
  to: string;
  daily: DailyItem[];
  daily_ai_scoring: DailyAIScoringItem[];
  teachers: Teacher[];
};

export type TeacherDashboard = {
  student_count: number;
  pending_count: number;
  overdue_count: number;
  submission_rate: number;
  avg_ai_scoring_ms?: number;
  from: string;
  to: string;
  daily: DailyItem[];
  daily_ai_scoring: DailyAIScoringItem[];
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
  generated_passwords: Array<{ email: string; password: string }>;
};

export type Assignment = {
  id: string;
  test_id: string;
  test_name?: string;
  skill?: string;
  tier?: string;
  student_id: string;
  student_name?: string;
  status: string;
  deadline?: string;
  created_at: string;
  /** Frozen at assignment time — NULL = assigned individually (not through a class). */
  class_id?: string;
  class_name?: string;
  time_limit_minutes?: number;
};

export type AnswerItem = {
  sequence: number;
  audio_url?: string;
  essay_text?: string;
  /** Question prompt (HTML) resolved from the bank set; part number. */
  question_prompt?: string;
  part?: number;
  /** Stimulus image URL of the question, resolved from the bank set. */
  stimulus_url?: string;
};

export type AssignmentResult = {
  id: string;
  assignment_id?: string;
  submission_id: string;
  review_status: "pending" | "approved";
  /** EffectiveResult: reviewed_result if edited, otherwise ai_result. */
  result: unknown;
  band?: number;
  /** Raw LLM output regardless of edits; absent for manual results. */
  ai_result?: unknown;
  /** "speaking" | "writing" — the authoritative skill from the set, so the UI need not guess from the shape. */
  skill?: string;
  student_id?: string;
  student_name?: string;
  credits_consumed: number;
  answers: AnswerItem[];
  released_at?: string;
  reviewed_at?: string;
  created_at: string;
  /**
   * The confidence gate decides whether an attempt is trustworthy enough to show the AI score directly or
   * the teacher must grade it. Present only on gated attempts (Speaking exam_high); for writing/ungated
   * it is undefined. status="fail" → open edit mode, hide the AI score, block approval until every score is filled.
   */
  gate?: ResultGate;
  /** Anti-cheat violations recorded during the exam (exam mode). */
  violations?: { total: number; by_type: Record<string, number> };
  /** Speaking fraud verdict for a full test (teacher view only). */
  fraud?: SpeakingFraudBlock;
  origin?: "assigned" | "self_practice";
  grading_mode?: "ai" | "manual";
};

export type ResultGate = {
  status: "pass" | "fail";
  raw_score?: number;
  threshold: number;
  reason?: string;
  /** Per-task decisions cho writing multi-task (Task 1 + Task 2). status top-level
   * = fail when any task fails; the overall result is then withheld. */
  tasks?: ResultTaskGate[];
};

export type ResultTaskGate = {
  index: number;
  status: "pass" | "fail";
  raw_score?: number;
  overall_band?: number;
  threshold: number;
  reason?: string;
};

// ─── Students ────────────────────────────────────────────────────────────────

export const studentApi = {
  list: () => apiFetch<Student[]>("/students"),
  create: (body: {
    email: string;
    password: string;
    display_name: string;
    phone?: string;
    /** The list of classes to enroll the student into on creation (optional). */
    class_ids?: string[];
    current_level?: string;
    current_band?: number;
  }) =>
    apiFetch<{ user_id: string }>("/students", { method: "POST", body }),
  // credit_limit is NOT optional on the wire: the backend reads its absence as
  // "reset this student to unlimited", so every update has to carry the value
  // it wants to keep.
  update: (
    id: string,
    body: {
      display_name: string;
      avatar_url?: string;
      phone?: string;
      current_level?: string;
      current_band?: number;
      credit_limit: number | null;
    },
  ) => apiFetch<void>(`/students/${id}`, { method: "PATCH", body }),
  importXlsx: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ImportResult>("/students/import", { method: "POST", body: form });
  },
};

// ─── Classes ─────────────────────────────────────────────────────────────────

export type ClassStatus = "active" | "completed" | "paused";

export type SmartClass = {
  id: string;
  name: string;
  level?: string;
  capacity?: number;
  start_date?: string;
  end_date?: string;
  teacher_id?: string;
  teacher_name?: string;
  student_count: number;
  assignment_count: number;
  completion_rate: number;
  status: ClassStatus;
  created_at: string;
};

export type SmartClassPayload = {
  name: string;
  level?: string;
  capacity?: number;
  start_date?: string;
  end_date?: string;
  teacher_id?: string;
  status?: ClassStatus;
};

export type SmartClassDetail = SmartClass & {
  students: Student[];
};

export const classApi = {
  list: () => apiFetch<SmartClass[]>("/smart/classes"),
  get: (id: string) => apiFetch<SmartClassDetail>(`/smart/classes/${id}`),
  // Assigned work freezes to its class (the backend filters by class_id). The path has NO
  // /smart prefix — the assignment context mounts on the bare /api/v1 group.
  assignments: (id: string) => apiFetch<Assignment[]>(`/classes/${id}/assignments`),
  create: (body: SmartClassPayload) =>
    apiFetch<{ id: string }>("/smart/classes", { method: "POST", body }),
  update: (id: string, body: SmartClassPayload) =>
    apiFetch<{ id: string }>(`/smart/classes/${id}`, { method: "PATCH", body }),
  addStudents: (id: string, studentIds: string[]) =>
    apiFetch<{ assigned: number }>(`/smart/classes/${id}/students`, { method: "POST", body: { student_ids: studentIds } }),
  removeStudents: (id: string, studentIds: string[]) =>
    apiFetch<{ removed: number }>(`/smart/classes/${id}/students/remove`, { method: "POST", body: { student_ids: studentIds } }),
  importXlsx: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ImportResult>("/smart/classes/import", { method: "POST", body: form });
  },
  delete: (id: string) => apiFetch<void>(`/smart/classes/${id}`, { method: "DELETE" }),
};

// ─── Teachers ────────────────────────────────────────────────────────────────

export const teacherApi = {
  list: () => apiFetch<Teacher[]>("/smart/teachers"),
  create: (body: { email: string; password: string; display_name: string; phone?: string; specialization?: string; status?: string }) =>
    apiFetch<{ user_id: string }>("/smart/teachers", { method: "POST", body }),
  update: (id: string, body: { display_name: string; phone?: string; specialization?: string; status?: string }) =>
    apiFetch<void>(`/smart/teachers/${id}`, { method: "PATCH", body }),
  importXlsx: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<ImportResult>("/smart/teachers/import", { method: "POST", body: form });
  },
};

export type SubmissionActivity = {
  student_name: string;
  test_name?: string;
  skill?: string;
  submitted_at: string;
};

export const activityApi = {
  recentSubmissions: (limit = 10) =>
    apiFetch<SubmissionActivity[]>(`/smart/activity/submissions?limit=${limit}`),
};

// Credit lives in non-fungible pools: a Fulltest unit can never be spent as a
// Speaking Part, so every package, pack and order names the pool it belongs to.
export type CreditUnitType = "legacy" | "fulltest" | "speaking_part" | "writing_task";

export type CreditPackage = {
  id: string;
  name: string;
  unit_type: CreditUnitType;
  credits: number;
  price_vnd: number;
  valid_days: number;
};

export type PurchaseResult = {
  order_id: string;
  checkout_url: string;
  amount: string;
  currency: string;
  purchase_id: string;
};

export type CreditPurchaseItem = {
  id: string;
  unit_type: CreditUnitType;
  credits: number;
  price_vnd: number;
  plan_code: string;
  status: string;
  created_at: string;
  paid_at?: string;
};

// A CreditPack is one credit package the centre owns (each purchase or grant = 1 pack).
// status is the effective state the backend recomputes by time ("active" | "expired"
// | "depleted"), not the raw status column. An empty name makes the FE fall back to "Gói N credit".
export type CreditPack = {
  id: string;
  name: string;
  unit_type: CreditUnitType;
  credits_total: number;
  credits_remaining: number;
  purchased_at: string;
  expires_at: string | null;
  status: string;
};

// Net consumption (charges minus refunds) per pool over the window the backend
// resolved, which defaults to the running calendar month in Vietnam time.
export type CreditUsage = {
  from: string;
  to: string;
  usage: Record<CreditUnitType, number>;
};

export const smartCreditApi = {
  // `balance` is the legacy pool, kept flat for the older partner portal;
  // `balances` carries every pool including the ones still at zero.
  balance: () =>
    apiFetch<{ balance: number; balances: Record<CreditUnitType, number> }>("/smart/credit/balance"),
  usage: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const query = qs.toString();
    return apiFetch<CreditUsage>(`/smart/credit/usage${query ? `?${query}` : ""}`);
  },
  packages: () => apiFetch<{ items: CreditPackage[] }>("/smart/credit/packages"),
  packs: () => apiFetch<{ items: CreditPack[] }>("/smart/credit/packs"),
  purchase: (packageId: string) =>
    apiFetch<PurchaseResult>("/smart/credit/purchase", { method: "POST", body: { package_id: packageId } }),
  purchases: () => apiFetch<{ items: CreditPurchaseItem[] }>("/smart/credit/purchases"),
};

export type SeatContract = {
  id: string;
  plan_code: string;
  plan_name: string;
  seats: number;
  term_months: number;
  price_per_seat_vnd: number;
  total_vnd: number;
  quota_fulltest: number;
  quota_speaking_part: number;
  quota_writing_task: number;
  starts_at: string;
  ends_at: string;
  status: "active" | "expired" | "cancelled";
  note: string;
};

export type SeatContractOverview = {
  contract: SeatContract;
  student_count: number;
};

export const smartSeatApi = {
  // 204 means the centre has no account plan — a state the console shows, not an error.
  current: async (): Promise<SeatContractOverview | null> => {
    const res = await apiFetch<{ items: SeatContract[]; student_count: number } | undefined>(
      "/smart/seat-contract",
    );
    const contract = res?.items?.[0];
    return contract ? { contract, student_count: res?.student_count ?? 0 } : null;
  },
};

export type PaymentOrder = {
  order_id: string;
  status: string;
  amount: string;
  currency: string;
  checkout_url?: string;
};

// Payment order status — lives under /api/v1/payment/* (no /smart prefix).
export const paymentApi = {
  getOrder: (orderId: string) => apiFetch<PaymentOrder>(`/payment/orders/${orderId}`),
  /** Production-safe simulated settlement for whitelisted accounts (simulate_payment flag).
   *  Authenticated; backend enforces owner + flag + fake_dev provider. */
  simulatePaid: (orderId: string) =>
    apiFetch<{ status: string }>(`/payment/orders/${orderId}/simulate-paid`, { method: "POST" }),
};

// ─── Account (current user) ──────────────────────────────────────────────────

export type Me = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
  name?: string;
  avatar_url?: string;
  preferred_language: string;
};

export const accountApi = {
  me: () => apiFetch<Me>("/me"),
  /** Name of the centre (partner) the account belongs to — readable by both owner and teacher. */
  partner: () => apiFetch<{ id: string; name: string }>("/smart/partner"),
  /** Feature flags per-user (vd simulate_payment cho account demo/tester). */
  myFlags: () => apiFetch<{ flags: Record<string, boolean> }>("/me/flags"),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardApi = {
  owner: (from?: string, to?: string) => {
    const q = from && to ? `?from=${from}&to=${to}` : "";
    return apiFetch<OwnerDashboard>(`/smart/dashboard${q}`);
  },
  teacher: (from?: string, to?: string) => {
    const q = from && to ? `?from=${from}&to=${to}` : "";
    return apiFetch<TeacherDashboard>(`/smart/my-dashboard${q}`);
  },
  myStudents: () => apiFetch<Student[]>("/smart/my-students"),
  unassignedStudents: () => apiFetch<Student[]>("/smart/my-students/unassigned"),
};

// ─── Teacher-scoped students ────────────────────────────────────────────────
// Teacher creates students enrolled into their class(es). class_ids must contain
// exactly 1 element = the class the teacher currently has selected.

export const myStudentApi = {
  list: () => apiFetch<Student[]>("/smart/my-students"),
  create: (body: {
    email: string;
    password: string;
    display_name: string;
    phone?: string;
    /** Must hold exactly 1 element = the teacher's class. */
    class_ids: string[];
    current_level?: string;
    current_band?: number;
  }) => apiFetch<{ user_id: string }>("/smart/my-students", { method: "POST", body }),
  importXlsx: (file: File, classId: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("class_id", classId);
    return apiFetch<ImportResult>("/smart/my-students/import", { method: "POST", body: form });
  },
};

// ─── Library (Ielts88 question sets — written by admins, shared by every centre) ──

export type LibrarySet = {
  id: string; // catalog set id (import target)
  title: string;
  skill: CatalogSkill | ""; // empty for a full_test set
  kind: CatalogSetKind;
  /** Legacy mirror of `kind`; prefer `kind`. */
  tier: string;
  /** The single Part every question shares; absent on full_test and on legacy multi-Part sets. */
  part?: number;
  item_count: number;
  imported: boolean;
};

export type LibraryItem = {
  skill: CatalogSkill;
  part: number;
  sequence: number;
  prompt: string; // HTML
  stimulus_url?: string;
};

export type LibrarySetDetail = LibrarySet & { items: LibraryItem[] };

export const libraryApi = {
  list: (opts?: { includeFullTest?: boolean }) =>
    apiFetch<LibrarySet[]>("/library", {
      query: { include_full_test: opts?.includeFullTest ? "true" : undefined },
    }),
  get: (id: string) => apiFetch<LibrarySetDetail>(`/library/${id}`),
  import: (id: string) =>
    apiFetch<{ id: string }>(`/library/${id}/import`, { method: "POST" }),
};

// ─── Assignments ─────────────────────────────────────────────────────────────

export const assignmentApi = {
  list: (testId?: string) => apiFetch<Assignment[]>("/assignments", { query: { test_id: testId } }),
  /** Per-set count of teacher-assigned assignments for the partner ("lượt giao"), keyed by set id. */
  assignmentCounts: async (): Promise<Record<string, number>> => {
    const { counts } = await apiFetch<{ counts: Record<string, number> }>("/smart/assignment-counts");
    return counts;
  },
  /** Sets deadline on many assignments at once; null clears it. Returns rows actually changed. */
  reschedule: (body: { assignment_ids: string[]; deadline: string | null }) =>
    apiFetch<{ updated: number }>("/assignments/deadline", { method: "PATCH", body }),
  /** Deletes the still-pending assignments among the ids. Handed-in work is never touched. */
  withdraw: (body: { assignment_ids: string[] }) =>
    apiFetch<{ deleted: number }>("/assignments/withdraw", { method: "POST", body }),
  assign: (
    testId: string,
    body: {
      student_ids: string[];
      /** Sent when assigning to a class — frozen into the assignment so it can be grouped by class later. Omitted for individual assignments. */
      class_id?: string;
      deadline?: string;
      /** 1–240; omitted = untimed. */
      time_limit_minutes?: number;
    },
  ) => apiFetch<{ ids: string[] }>(`/tests/${testId}/assign`, { method: "POST", body }),
};

export const mediaApi = {
  presignUpload: (body: { media_type: "image" | "audio"; content_type: string }) =>
    apiFetch<{ upload_url: string; public_url: string }>("/media/presign-upload", { method: "POST", body }),
};

// ─── Results ─────────────────────────────────────────────────────────────────

export const resultApi = {
  list: (params?: { testId?: string; origin?: "assigned" | "self_practice" }) =>
    apiFetch<AssignmentResult[]>("/results", { query: { test_id: params?.testId, origin: params?.origin } }),
  get: (id: string) => apiFetch<AssignmentResult>(`/results/${id}`),
  review: (id: string, body: { reviewed_result: unknown }) =>
    apiFetch<void>(`/results/${id}`, { method: "PATCH", body }),
  approve: (id: string) => apiFetch<void>(`/results/${id}/approve`, { method: "POST" }),
};

export const partnerExamRulesApi = {
  get: () => apiFetch<ExamRules>("/smart/exam-rules"),
  update: (body: ExamRules) => apiFetch<void>("/smart/exam-rules", { method: "PATCH", body }),
};
