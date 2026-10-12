/**
 * Helpers for the seat-plan specs: sign, read and cancel account-plan contracts
 * through the admin API, and read a centre's pool balance.
 *
 * Admin logs in against the backend directly, not the BFF: routeForRole treats
 * "admin" as an unknown role here and bounces it to /login.
 */

import type { APIRequestContext, APIResponse } from "@playwright/test";
import { apiBase } from "../setup/auth";

export type SeatContractDTO = {
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

export type SeatContractList = {
  items: SeatContractDTO[];
  student_count: number;
};

export type SignContractBody = {
  plan_code: string;
  seats: number;
  term_months: number;
  starts_at?: string;
  note?: string;
  closing?: { amount_minor: number; currency: string };
};

async function accessToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${apiBase()}/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`login ${email} failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`login ${email} returned no access_token`);
  return body.access_token;
}

export function adminAccessToken(request: APIRequestContext): Promise<string> {
  return accessToken(request, "admin@e2e.local", "Test@1234");
}

export function accessTokenFor(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  return accessToken(request, email, password);
}

export async function findPartnerIdByName(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const res = await request.get(`${apiBase()}/admin/partners`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`list partners failed: ${res.status()}`);
  const body = (await res.json()) as { items: Array<{ id: string; name: string }> };
  const found = body.items.find((p) => p.name === name);
  if (!found) throw new Error(`partner "${name}" not found — is seed-e2e up to date?`);
  return found.id;
}

export function signContract(
  request: APIRequestContext,
  token: string,
  partnerId: string,
  body: SignContractBody,
): Promise<APIResponse> {
  return request.post(`${apiBase()}/admin/partners/${partnerId}/seat-contracts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { closing: { amount_minor: 0, currency: "VND" }, ...body },
  });
}

export async function listContracts(
  request: APIRequestContext,
  token: string,
  partnerId: string,
): Promise<SeatContractList> {
  const res = await request.get(`${apiBase()}/admin/partners/${partnerId}/seat-contracts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`list contracts failed: ${res.status()}`);
  return (await res.json()) as SeatContractList;
}

export async function cancelContract(
  request: APIRequestContext,
  token: string,
  partnerId: string,
  contractId: string,
): Promise<void> {
  const res = await request.post(
    `${apiBase()}/admin/partners/${partnerId}/seat-contracts/${contractId}/cancel`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok()) throw new Error(`cancel contract failed: ${res.status()}`);
}

export async function cancelActiveContracts(
  request: APIRequestContext,
  token: string,
  partnerId: string,
): Promise<void> {
  const { items } = await listContracts(request, token, partnerId);
  for (const c of items.filter((x) => x.status === "active")) {
    await cancelContract(request, token, partnerId, c.id);
  }
}

export async function poolBalance(
  request: APIRequestContext,
  token: string,
  pool: string,
): Promise<number> {
  const res = await request.get(`${apiBase()}/smart/credit/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`read credit balance failed: ${res.status()}`);
  const body = (await res.json()) as { balances?: Record<string, number> };
  return body.balances?.[pool] ?? 0;
}

export async function findStudentIdByEmail(
  request: APIRequestContext,
  ownerToken: string,
  email: string,
): Promise<string> {
  const res = await request.get(`${apiBase()}/students?limit=100`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  if (!res.ok()) throw new Error(`list students failed: ${res.status()}`);
  const body = (await res.json()) as Array<{ user_id: string; email?: string }>;
  const found = body.find((s) => s.email === email);
  if (!found) throw new Error(`student "${email}" not found in the centre`);
  return found.user_id;
}

export async function firstPendingAssignmentId(
  request: APIRequestContext,
  studentToken: string,
): Promise<string> {
  const res = await request.get(`${apiBase()}/student/assignments`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  if (!res.ok()) throw new Error(`list student assignments failed: ${res.status()}`);
  const body = await res.json();
  const items = (Array.isArray(body) ? body : body.items) as Array<{ id: string; status: string }>;
  const pending = items.find((a) => a.status === "pending");
  if (!pending) throw new Error("no pending assignment left for this student");
  return pending.id;
}

/** Presign, upload, submit — the app's own path, minus the exam-engine take UI. */
export async function submitSpeakingViaApi(
  request: APIRequestContext,
  studentToken: string,
  assignmentId: string,
): Promise<void> {
  const headers = { Authorization: `Bearer ${studentToken}` };
  const urlRes = await request.get(
    `${apiBase()}/student/assignments/${assignmentId}/upload-urls`,
    { headers },
  );
  if (!urlRes.ok()) throw new Error(`upload-urls failed: ${urlRes.status()}`);
  const { upload_urls } = (await urlRes.json()) as { upload_urls: Record<string, string> };

  const audio = Buffer.alloc(2048, 7);
  const answers: Array<{ question_id: string; sequence: number; audio_url: string }> = [];

  for (const [questionId, url] of Object.entries(upload_urls)) {
    const put = await request.fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "audio/webm" },
      data: audio,
    });
    if (!put.ok()) throw new Error(`upload audio failed: ${put.status()}`);

    // Presigned path: <bucket>/audio/<student>/<assignment>/<sequence>.webm
    const objectKey = url.split("?")[0].split(/\/ielts88\//)[1];
    const sequence = Number(/\/(\d+)\.webm$/.exec(objectKey)?.[1]);
    if (!objectKey || Number.isNaN(sequence)) {
      throw new Error(`cannot derive object key/sequence from ${url}`);
    }
    answers.push({ question_id: questionId, sequence, audio_url: objectKey });
  }
  answers.sort((a, b) => a.sequence - b.sequence);

  const res = await request.post(`${apiBase()}/student/assignments/${assignmentId}/submit`, {
    headers,
    data: { answers },
  });
  if (res.status() !== 202) {
    throw new Error(`submit failed: ${res.status()} ${await res.text()}`);
  }
}

export const SEAT_PARTNER_NAME = "E2E Seat Center";
export const SEAT_OWNER = { email: "owner-seat@e2e.local", password: "Test@1234" };
export const SEAT_STUDENT = { email: "student-seat@e2e.local", password: "Test@1234" };
export const SEAT_BANK_SET_NAME = "E2E Seat Speaking Set";

/**
 * Assigns the centre's own set to its own student and returns the run id.
 *
 * The money specs provision rather than consume a seeded run: a spec that eats a
 * fixture passes once per fresh seed and then fails on every rerun against the
 * same stack, which reads exactly like a real regression.
 */
export async function provisionRun(
  request: APIRequestContext,
  ownerToken: string,
  studentEmail: string,
  bankSetName: string,
): Promise<string> {
  const headers = { Authorization: `Bearer ${ownerToken}` };

  const setsRes = await request.get(`${apiBase()}/banks?limit=50`, { headers });
  if (!setsRes.ok()) throw new Error(`list banks failed: ${setsRes.status()}`);
  const sets = (await setsRes.json()) as Array<{ id: string; name: string }>;
  const set = sets.find((b) => b.name === bankSetName);
  if (!set) throw new Error(`bank set "${bankSetName}" not found in this centre`);

  const studentsRes = await request.get(`${apiBase()}/students?limit=50`, { headers });
  if (!studentsRes.ok()) throw new Error(`list students failed: ${studentsRes.status()}`);
  const students = (await studentsRes.json()) as Array<{ user_id: string; email?: string }>;
  const student = students.find((st) => st.email === studentEmail);
  if (!student) throw new Error(`student "${studentEmail}" not found in this centre`);

  const res = await request.post(`${apiBase()}/tests/${set.id}/assign`, {
    headers,
    data: { student_ids: [student.user_id] },
  });
  if (!res.ok()) throw new Error(`assign failed: ${res.status()} ${await res.text()}`);
  const { ids } = (await res.json()) as { ids: string[] };
  if (!ids?.[0]) throw new Error("assign returned no assignment id");
  return ids[0];
}
