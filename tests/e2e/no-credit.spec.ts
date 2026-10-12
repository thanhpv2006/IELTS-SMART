/**
 * E2E spec: R1/R2/R8/R9 — an assigned Speaking submission from a centre with no AI credit
 * falls back to manual grading instead of being rejected.
 *
 * Stack: REAL backend + worker. Fakes: ss-proxy + OpenAI (neither is called here — a manual
 * result skips the scoring pipeline entirely).
 * See tests/E2E-CONTRACT.md §"Phase 2 — assignment bổ sung".
 *
 * Seed requirements (must be satisfied by seed-e2e before running):
 *   - `student-nocredit@e2e.local` / `owner-nocredit@e2e.local` in "E2E NoCredit Center"
 *     (no active credit pack, no seat contract — still a customer, just out of credit).
 *   - Exactly TWO speaking assignments in status=pending assigned to the student: this spec
 *     consumes the first (`.first()` on "Làm bài"), CS-02 in charge-on-submit.spec.ts the last
 *     — each test owns its own assignment regardless of run order.
 *
 * Backend behaviour asserted:
 *   POST /student/assignments/:id/submit → 202, no body.
 *   The result lands with grading_mode="manual", review_status="pending", band=null,
 *   credits_consumed=0 — the ledger is never touched (see CS-02).
 *
 * UI behaviour asserted:
 *   - Student card: no more "Làm bài" for this assignment; status reads
 *     "Hết lượt chấm AI · chờ giáo viên chấm" until release.
 *   - Owner `/results`: "Hết lượt chấm AI" tag on the row.
 *   - Review screen: same tag in the header, no `ai-compare-tab` (nothing to compare — there is
 *     no AI pass), opens straight into edit mode so the teacher can fill all 4 criteria and
 *     "Chốt kết quả".
 *   - Student card afterwards: "Có kết quả".
 */

import { test, expect, type BrowserContext } from "@playwright/test";
import { loginAs, bffBase } from "../setup/auth";
import { answerAllSpeakingQuestions, startExam } from "./helpers";
import { fillCriteriaBands } from "./grading";
import { findPendingResultId } from "./provision";

test.setTimeout(120_000);

const OWNER_NOCREDIT_EMAIL = "owner-nocredit@e2e.local";
const PASSWORD = "Test@1234";

/** Logs the context's cookie into owner-nocredit (for page nav) and returns its access token. */
async function loginAsOwnerNoCredit(context: BrowserContext): Promise<string> {
  const bff = bffBase();
  const res = await context.request.post(`${bff}/api/auth/login`, {
    data: { email: OWNER_NOCREDIT_EMAIL, password: PASSWORD },
    headers: { Origin: bff, "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(`login ${OWNER_NOCREDIT_EMAIL} failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

test.beforeEach(async ({ context }) => {
  await loginAs(context, "student-nocredit");
});

test("student-nocredit: submit falls back to manual grading, owner reviews and releases it", async ({
  page,
  context,
}) => {
  await page.goto("/student/assignments");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bài tập" }),
  ).toBeVisible({ timeout: 15_000 });

  const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
  await expect(takeLink).toBeVisible({ timeout: 10_000 });
  const takeHref = await takeLink.getAttribute("href");
  const assignmentId = takeHref?.split("/").pop() ?? "";
  expect(assignmentId).toBeTruthy();

  await takeLink.click();
  await startExam(page);
  await answerAllSpeakingQuestions(page);

  await expect(page).toHaveURL("/student/assignments", { timeout: 60_000 });
  const card = page.getByTestId(`assignment-card-${assignmentId}`);
  await expect(card).toContainText("Hết lượt chấm AI · chờ giáo viên chấm", { timeout: 15_000 });
  await expect(page.getByTestId(`take-btn-${assignmentId}`)).toHaveCount(0);

  const ownerToken = await loginAsOwnerNoCredit(context);
  let resultId = "";
  await expect
    .poll(
      async () => {
        resultId = (await findPendingResultId(context, ownerToken, assignmentId)) ?? "";
        return resultId;
      },
      { message: `waiting for the manual result of assignment ${assignmentId}`, timeout: 15_000 },
    )
    .toBeTruthy();

  await page.goto("/results", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId(`result-row-${resultId}`)).toContainText("Hết lượt chấm AI");

  await page.getByTestId(`result-review-link-${resultId}`).click();
  await expect(page).toHaveURL(new RegExp(`/results/${resultId}`));
  await expect(page.getByText("Hết lượt chấm AI").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("ai-compare-tab")).toHaveCount(0);

  await fillCriteriaBands(page, "7");
  const finalizeBtn = page.getByTestId("finalize-result-btn");
  await expect(finalizeBtn).toBeEnabled({ timeout: 5_000 });
  await finalizeBtn.click();
  await page.getByTestId("finalize-confirm-btn").click();
  await expect(page.getByTestId("result-status-pill")).toHaveText("Đã đánh giá", { timeout: 15_000 });

  await loginAs(context, "student-nocredit");
  await expect
    .poll(
      async () => {
        await page.goto("/student/assignments", { waitUntil: "domcontentloaded" });
        return (await page.getByTestId(`view-result-btn-${assignmentId}`).count()) > 0;
      },
      { message: "waiting for the student card to show 'Có kết quả'", timeout: 15_000 },
    )
    .toBe(true);
  await expect(card).toContainText("Có kết quả");
});
