/**
 * E2E spec: RES-05 / RES-06 / RES-07 — owner reviews a result and saves band.
 *
 * Confidence-gate behaviour (product, 2026-06-30) — there is NO auto-release any more:
 *   - Every submission needs a teacher review + approval before being released.
 *   - **gate=Fail** (the attempt did NOT pass the gate): hide the AI score from the teacher → band inputs
 *     stay EMPTY, the footer opens straight into edit mode (no "Chỉnh sửa" button), and approval is blocked
 *     until the teacher fills in every score.
 *   - **gate=Pass**: show the AI score read-only; the teacher clicks "Chỉnh sửa" to adjust
 *     (bands pre-filled) and then approves.
 *
 * Both branches provision their own assignment for `student-review@e2e.local` and grade it
 * through the real pipeline, so the suite can be re-run against a seed it has already used.
 * Which branch comes out is decided by the question set: fake-openai answers "E2E Batch Set"
 * with the low-confidence fixture (gate=Fail) and everything else with the passing one.
 *
 * Approving is one-way — there is no un-approve endpoint — so neither test may consume a
 * result the seed hand-inserted. student04's seeded gate-fail result stays untouched for the
 * /assignments statistics specs.
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { loginAs } from "../setup/auth";
import { completeSpeakingAssignmentById } from "./helpers";
import { fillCriteriaBands, overallBandText } from "./grading";
import {
  GATE_FAIL_SET_NAME,
  SPEAKING_SET_NAME,
  findPendingResultId,
  getOwnerAccessToken,
  provisionAssignmentAsOwner,
} from "./provision";

test.setTimeout(180_000);

const STUDENT_EMAIL = "student-review@e2e.local";

// Criterion bands whose average is 6.75 — deliberately an average where the rounding rule shows
// itself: the criterion-average rule the backend stores gives 7.0, the mock floor rule gives 6.5.
const CRITERIA = ["6", "7", "7", "7"];
const EXPECTED_BAND = "7.0";

/**
 * Provisions one assignment of `setName`, has the student sit it, and returns the pending
 * result the pipeline produced. Leaves the context logged in as the owner.
 */
async function gradeFreshAssignment(
  page: Page,
  context: BrowserContext,
  setName: string,
): Promise<string> {
  const { assignmentId } = await provisionAssignmentAsOwner(context, STUDENT_EMAIL, setName);

  await loginAs(context, "student-review");
  await completeSpeakingAssignmentById(page, assignmentId);

  await loginAs(context, "owner");
  const token = await getOwnerAccessToken(context);

  let resultId = "";
  await expect
    .poll(
      async () => {
        resultId = (await findPendingResultId(context, token, assignmentId)) ?? "";
        return resultId;
      },
      {
        message: `Chờ pipeline chấm xong assignment ${assignmentId}`,
        timeout: 90_000,
        intervals: [2_000, 3_000, 5_000],
      },
    )
    .toBeTruthy();

  return resultId;
}

/** "Chốt kết quả": press the finalize button, then confirm in the dialog. */
async function finalizeResult(page: Page): Promise<void> {
  await page.getByTestId("finalize-result-btn").click();
  await page.getByTestId("finalize-confirm-btn").click();
}

// ─────────────────────────────────────────────────────────────────────────────
// gate-FAIL: điểm AI bị ẩn (band trống) → giáo viên tự fill → duyệt (RES-05/06/07)
// ─────────────────────────────────────────────────────────────────────────────
test("owner reviews a GATE-FAIL result: AI band hidden (blank), teacher fills then approves (RES-05/07)", async ({
  page,
  context,
}) => {
  const resultId = await gradeFreshAssignment(page, context, GATE_FAIL_SET_NAME);
  await page.goto(`/results/${resultId}`, { waitUntil: "domcontentloaded" });

  // gate-FAIL → the footer opens straight into edit mode: there is NO "Chỉnh sửa" button.
  await expect(page.getByTestId("finalize-result-btn")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("edit-result-btn")).toHaveCount(0);

  // StatusPill: not approved yet.
  await expect(page.getByTestId("result-status-pill")).toHaveText("Chờ đánh giá", { timeout: 10_000 });

  // RES-05 (gate-fail): điểm AI bị ẩn → chưa tiêu chí nào có điểm nên band chưa tính được.
  expect(await overallBandText(page)).toBe("—");

  // Nothing filled in → finalizing is impossible (the button is disabled).
  const finalizeBtn = page.getByTestId("finalize-result-btn");
  await expect(finalizeBtn).toBeDisabled();

  // The teacher fills in the 4 criteria; the band follows from them, rounded the way SaveReview
  // will round it — a preview on the mock floor rule would show 6.5 here and store 7.0.
  await fillCriteriaBands(page, CRITERIA);
  expect(await overallBandText(page)).toBe(EXPECTED_BAND);
  await expect(finalizeBtn).toBeEnabled({ timeout: 3_000 });

  // "Cập nhật" only saves the review (PATCH) without approving → the student does NOT see it yet.
  // Checked through the network call and the status pill (span save-success-msg is hidden below the `sm` breakpoint).
  const updateResp = page.waitForResponse(
    (r) => r.url().includes(`/results/${resultId}`) && r.request().method() === "PATCH",
    { timeout: 15_000 },
  );
  await page.getByTestId("update-result-btn").click();
  expect((await updateResp).status()).toBe(204);
  await expect(page.getByTestId("result-status-pill")).toHaveText("Chờ đánh giá");

  // RES-07: "Chốt" = review + approve → release cho học viên.
  await finalizeResult(page);
  await expect(page.getByTestId("result-status-pill")).toHaveText("Đã đánh giá", { timeout: 15_000 });

  // The band now on screen is the one SaveReview recomputed and stored, not the preview's guess.
  // If the two rounding rules ever diverge again, this is where it shows.
  expect(await overallBandText(page)).toBe(EXPECTED_BAND);

  // /results: badge "Đã duyệt".
  await page.goto("/results", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await expect(page.getByTestId(`result-status-${resultId}`)).toHaveText("Đã duyệt", { timeout: 10_000 });

  console.log(`[review-band] GATE-FAIL result ${resultId}: blank → filled → approved ✓`);
});

// ─────────────────────────────────────────────────────────────────────────────
// gate-PASS: the AI score shows read-only → click "Chỉnh sửa" (bands pre-filled) → approve
// ─────────────────────────────────────────────────────────────────────────────
test("owner reviews a GATE-PASS result: AI band shown, edit then approve (RES-05/07)", async ({
  page,
  context,
}) => {
  const resultId = await gradeFreshAssignment(page, context, SPEAKING_SET_NAME);
  await page.goto(`/results/${resultId}`, { waitUntil: "domcontentloaded" });

  // Speaking error highlight: the passing fixture has an error block (error_part ⊂ original_answer)
  // → the transcript must render at least one highlight span.
  await expect(page.getByTestId("speaking-mark").first()).toBeVisible({ timeout: 15_000 });

  // gate-PASS → opens in VIEW mode: there is a "Chỉnh sửa" button and the AI score SHOWS.
  const editBtn = page.getByTestId("edit-result-btn");
  await expect(editBtn).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("band-select-overall")).toContainText(/\d/); // the AI band is displayed

  // Vào edit → các tiêu chí đã PRE-FILL điểm AI nên band vẫn tính ra số (khác gate-fail = "—").
  await editBtn.click();
  const finalizeBtn = page.getByTestId("finalize-result-btn");
  await expect(finalizeBtn).toBeVisible({ timeout: 5_000 });
  expect(await overallBandText(page)).not.toBe("—");
  await fillCriteriaBands(page, CRITERIA);
  expect(await overallBandText(page)).toBe(EXPECTED_BAND);
  await expect(finalizeBtn).toBeEnabled({ timeout: 3_000 });
  await finalizeResult(page);

  await expect(page.getByTestId("result-status-pill")).toHaveText("Đã đánh giá", { timeout: 15_000 });
  console.log(`[review-band] GATE-PASS result ${resultId}: AI shown → edited → approved ✓`);
});
