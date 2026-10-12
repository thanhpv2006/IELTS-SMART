/**
 * Self-provisioning helpers for E2E tests that need fresh assignments.
 *
 * Strategy: log in as `owner`, call the assignmentApi directly via
 * context.request (authenticated with the owner cookie), then log in
 * as the target student.  This avoids consuming pre-seeded pending
 * assignments that belong to other specs (e.g. take-speaking.spec.ts
 * owns student@e2e.local, review-band.spec.ts owns student-review@).
 *
 * Students available for self-provisioning (s15..s21 — unclassed):
 *   student15@e2e.local .. student21@e2e.local  password: Test@1234
 *
 * Both "E2E Speaking Set" (id discovered at runtime via /banks) and
 * "E2E Writing Homework Set" (writing) are in E2E Center.
 *
 * API paths (confirmed from E2E-CONTRACT.md §"Endpoint smart THẬT"):
 *   GET  /api/v1/banks                       → list bank sets
 *   POST /api/v1/tests/:testId/assign        → assign to student_ids
 *   GET  /api/v1/students?limit=50           → list students (owner)
 *
 * Note: the `apiFetch` client runs only in the Next.js browser runtime.
 * In Playwright node context we call the backend directly with
 * context.request (which carries the owner cookie via loginAs).
 */

import type { BrowserContext } from "@playwright/test";
import { loginAs, bffBase, apiBase } from "../setup/auth";

const BFF = () => bffBase();
const API = () => apiBase();

/** One E2E Speaking Set that is shared by E2E Center (owner). */
export const SPEAKING_SET_NAME = "E2E Speaking Set";
/** Writing homework set for student-writing flows. */
export const WRITING_SET_NAME = "E2E Writing Homework Set";
/**
 * Grading an assignment of this set yields a low-confidence (gate=Fail) result: fake-openai
 * keys the gate-FAIL fixture off its Part 3 prompt (tests/fakes/openai/server.js). Reserved
 * for review-band.spec.ts — sending it through scoring anywhere else changes that spec's data.
 */
export const GATE_FAIL_SET_NAME = "E2E Batch Set";

/**
 * Pool of students available for self-provisioning.
 * student15..21 are "chưa xếp lớp" per Seed inventory v2.
 */
export const PROVISION_STUDENTS: Array<{ email: string; index: number }> = [
  { email: "student15@e2e.local", index: 15 },
  { email: "student16@e2e.local", index: 16 },
  { email: "student17@e2e.local", index: 17 },
  { email: "student18@e2e.local", index: 18 },
  { email: "student19@e2e.local", index: 19 },
  { email: "student20@e2e.local", index: 20 },
  { email: "student21@e2e.local", index: 21 },
];

type BankSet = { id: string; name: string; skill: string };
type Student = { user_id: string; email?: string };

/**
 * Gets a fresh owner access token by logging in, then returns it so we
 * can make direct backend calls (bypassing BFF, which requires cookies).
 * We use the BFF /api/auth/login → get access token from BFF response,
 * then call /api/v1 endpoints directly from node context.
 */
export async function getOwnerAccessToken(context: BrowserContext): Promise<string> {
  const acc = { email: "owner@e2e.local", password: "Test@1234" };
  const bff = BFF();
  const res = await context.request.post(`${bff}/api/auth/login`, {
    data: { email: acc.email, password: acc.password },
    headers: { Origin: bff, "Content-Type": "application/json" },
  });
  if (!res.ok()) throw new Error(`getOwnerAccessToken: login failed ${res.status()} ${await res.text()}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

/**
 * Finds a bank set by name from GET /api/v1/banks (owner authed).
 */
async function findBankSetId(accessToken: string, context: BrowserContext, name: string): Promise<string> {
  const api = API();
  const res = await context.request.get(`${api}/banks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) throw new Error(`findBankSetId: GET /banks failed ${res.status()}`);
  const sets = await res.json() as BankSet[];
  const found = sets.find((s) => s.name === name);
  if (!found) throw new Error(`findBankSetId: bank set "${name}" not found. Available: ${sets.map((s) => s.name).join(", ")}`);
  return found.id;
}

/**
 * Looks up student user_id by email via GET /api/v1/students.
 */
async function findStudentUserId(accessToken: string, context: BrowserContext, email: string): Promise<string> {
  const api = API();
  const res = await context.request.get(`${api}/students?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) throw new Error(`findStudentUserId: GET /students failed ${res.status()}`);
  const students = await res.json() as Student[];
  const found = students.find((s) => s.email === email);
  if (!found) throw new Error(`findStudentUserId: student "${email}" not found. Available: ${students.map((s) => s.email).join(", ")}`);
  return found.user_id;
}

/**
 * Assigns a bank test to a student by calling POST /api/v1/tests/:testId/assign.
 * Returns the created assignment ID(s).
 */
async function assignToStudent(
  accessToken: string,
  context: BrowserContext,
  testId: string,
  studentUserId: string,
  deadline?: string,
): Promise<string[]> {
  const api = API();
  const body: { student_ids: string[]; deadline?: string } = { student_ids: [studentUserId] };
  if (deadline) body.deadline = deadline;

  const res = await context.request.post(`${api}/tests/${testId}/assign`, {
    data: body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok()) throw new Error(`assignToStudent: POST /tests/${testId}/assign failed ${res.status()} ${await res.text()}`);
  const data = await res.json() as { ids: string[] };
  return data.ids;
}

export type ProvisionedAssignment = {
  /** The student's email, used for loginAs(). */
  studentEmail: string;
  /** The assignment ID assigned to this student. */
  assignmentId: string;
};

/**
 * Provisions a fresh speaking assignment for a student from the pool.
 *
 * Steps:
 *   1. loginAs owner (mints fresh session for this context).
 *   2. GET /banks → find "E2E Speaking Set" (or custom name).
 *   3. GET /students → find the student by email.
 *   4. POST /tests/:id/assign → create pending assignment.
 *   5. loginAs the student (same context, overwrites cookie).
 *
 * The caller then navigates to /student/assignments and the fresh
 * assignment will appear.
 */
export async function provisionSpeakingAssignment(
  context: BrowserContext,
  studentEmail: string,
  bankSetName = SPEAKING_SET_NAME,
  deadline?: string,
): Promise<ProvisionedAssignment> {
  const accessToken = await getOwnerAccessToken(context);
  const testId = await findBankSetId(accessToken, context, bankSetName);
  const studentUserId = await findStudentUserId(accessToken, context, studentEmail);
  const ids = await assignToStudent(accessToken, context, testId, studentUserId, deadline);
  const assignmentId = ids[0];
  if (!assignmentId) throw new Error("provisionSpeakingAssignment: no assignment ID returned");

  // Switch session to the student
  await loginAs(context, "student-writing"); // placeholder; overwritten below
  // loginAs uses email/password from SEED_ACCOUNTS which doesn't include s15..s21.
  // For provisioned students, we do a manual login:
  const bff = BFF();
  const loginRes = await context.request.post(`${bff}/api/auth/login`, {
    data: { email: studentEmail, password: "Test@1234" },
    headers: { Origin: bff, "Content-Type": "application/json" },
  });
  if (!loginRes.ok()) throw new Error(`provisionSpeakingAssignment: login as ${studentEmail} failed ${loginRes.status()}`);

  return { studentEmail, assignmentId };
}

/**
 * Like provisionSpeakingAssignment but for a specific writing or speaking bank.
 * Does NOT automatically switch context to the student — caller does it after.
 */
export async function provisionAssignmentAsOwner(
  context: BrowserContext,
  studentEmail: string,
  bankSetName: string,
  deadline?: string,
): Promise<{ assignmentId: string; testId: string }> {
  const accessToken = await getOwnerAccessToken(context);
  const testId = await findBankSetId(accessToken, context, bankSetName);
  const studentUserId = await findStudentUserId(accessToken, context, studentEmail);
  const ids = await assignToStudent(accessToken, context, testId, studentUserId, deadline);
  const assignmentId = ids[0];
  if (!assignmentId) throw new Error("provisionAssignmentAsOwner: no assignment ID returned");
  return { assignmentId, testId };
}

/**
 * Logs in as a provisioned student by email+password (not in SEED_ACCOUNTS).
 */
export async function loginAsProvisionedStudent(
  context: BrowserContext,
  email: string,
): Promise<void> {
  const bff = BFF();
  const res = await context.request.post(`${bff}/api/auth/login`, {
    data: { email, password: "Test@1234" },
    headers: { Origin: bff, "Content-Type": "application/json" },
  });
  if (!res.ok()) throw new Error(`loginAsProvisionedStudent(${email}): ${res.status()} ${await res.text()}`);
}

/**
 * Resolves the result the pipeline created for one assignment, or null while it is still
 * scoring. Matching on assignment_id instead of on the student's name + "Chờ review" badge
 * keeps the lookup deterministic once that student carries results from an earlier run.
 */
export async function findPendingResultId(
  context: BrowserContext,
  accessToken: string,
  assignmentId: string,
): Promise<string | null> {
  const res = await context.request.get(`${API()}/results?limit=1000`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok()) throw new Error(`findPendingResultId: GET /results failed ${res.status()}`);
  const items = await res.json() as Array<{ id: string; assignment_id?: string; review_status: string }>;
  const found = items.find((r) => r.assignment_id === assignmentId && r.review_status === "pending");
  return found?.id ?? null;
}
