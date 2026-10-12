/**
 * Charging on submit (CS-01..02) — the ledger and the balance have to agree, and a submission
 * the centre cannot afford must leave the ledger untouched (it falls back to manual grading
 * instead of being refused).
 */

import { test, expect } from "@playwright/test";
import { apiBase } from "../setup/auth";
import {
  MONEY_SET_NAME,
  MONEY_STUDENT_EMAIL,
  moneyOwnerToken,
  moneyStudentToken,
  poolBalance,
  provisionRun,
  usageByUnit,
} from "./money";
import { accessTokenFor, submitSpeakingViaApi } from "./seat";

/**
 * The seed gives student-nocredit TWO pending Speaking assignments so no-credit.spec.ts
 * (UI, picks the first "Làm bài") and this test (API, picks the last) never consume the same
 * one regardless of run order.
 */
async function lastPendingAssignmentId(
  request: import("@playwright/test").APIRequestContext,
  studentToken: string,
): Promise<string> {
  const res = await request.get(`${apiBase()}/student/assignments`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  if (!res.ok()) throw new Error(`list student assignments failed: ${res.status()}`);
  const body = await res.json();
  const items = (Array.isArray(body) ? body : body.items) as Array<{
    id: string;
    status: string;
  }>;
  const pending = items.filter((a) => a.status === "pending");
  if (pending.length < 1) throw new Error("no pending assignment left for student-nocredit");
  return pending[pending.length - 1].id;
}

test.describe.configure({ mode: "serial" });

test.describe("CS-01..02: charging a submission", () => {
  test("CS-01: a one-Part practice set resolves a price and the ledger matches the balance", async ({
    request,
  }) => {
    const ownerToken = await moneyOwnerToken(request);
    const balanceBefore = await poolBalance(request, ownerToken, "speaking_part");
    const usageBefore = (await usageByUnit(request, ownerToken)).speaking_part ?? 0;

    const runId = await provisionRun(request, ownerToken, MONEY_STUDENT_EMAIL, MONEY_SET_NAME);
    // Throws on any non-202, which is the regression guard: a `practice` set with
    // no price row used to answer 500 here.
    await submitSpeakingViaApi(request, await moneyStudentToken(request), runId);

    const spent = balanceBefore - (await poolBalance(request, ownerToken, "speaking_part"));
    const charged = ((await usageByUnit(request, ownerToken)).speaking_part ?? 0) - usageBefore;

    expect(spent).toBeGreaterThan(0);
    expect(charged).toBe(spent);
  });

  test("CS-02: an unaffordable assigned submission goes to manual grading without writing to the ledger", async ({
    request,
  }) => {
    const ownerToken = await accessTokenFor(request, "owner-nocredit@e2e.local", "Test@1234");
    const balanceBefore = await poolBalance(request, ownerToken, "legacy");
    const usageBefore = await usageByUnit(request, ownerToken);

    const studentToken = await accessTokenFor(request, "student-nocredit@e2e.local", "Test@1234");
    const assignmentId = await lastPendingAssignmentId(request, studentToken);

    // Out-of-credit assigned submissions no longer fail — they fall back to manual grading.
    await submitSpeakingViaApi(request, studentToken, assignmentId);

    expect(await poolBalance(request, ownerToken, "legacy")).toBe(balanceBefore);
    expect(await usageByUnit(request, ownerToken)).toEqual(usageBefore);

    const res = await request.get(`${apiBase()}/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    if (!res.ok()) throw new Error(`list student assignments failed: ${res.status()}`);
    const body = await res.json();
    const items = (Array.isArray(body) ? body : body.items) as Array<{
      id: string;
      status: string;
      grading_mode?: string;
    }>;
    const submitted = items.find((a) => a.id === assignmentId);
    expect(submitted?.status).toBe("scored");
    expect(submitted?.grading_mode).toBe("manual");
  });
});
