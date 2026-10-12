/**
 * E2E spec: Writing take-flow + student result writing review
 *
 * Covers section 11 (Writing path):
 *   TK-30: writing opens onto the editor with no mic test, behind the fullscreen gate
 *
 * The editor itself — word count, minimum-word hints, task tabs, two-column layout — belongs to
 * the exam engine and is covered by that package's own tests.
 *
 * Then: submit writing assignment → wait for scoring → owner reviews result
 *
 * Covers (partial) writing review (RES-03/11/12):
 *   RES-03: student opens /student/assignments → clicks "Xem kết quả" → writing result view
 *   RES-11: multi-task result has Task1/Task2 tab switcher (or single-task overview)
 *   RES-12: essay-highlight + "Bản sửa gợi ý" tab in writing result view
 *
 * Self-provisioning strategy:
 *   Each test describe block provisions a fresh writing assignment for student20
 *   or student21 (unclassed, from s15..s21 pool in Seed inventory v2) via
 *   provisionAssignmentAsOwner(). This allows the suite to be re-run multiple
 *   times without consuming the pre-seeded student-writing assignment.
 *
 * Writing scoring pipeline: submit → fake-openai serves writing_exam_high.json
 * fixture (multi_task) → worker processes → result released.
 *
 * IMPORTANT: do NOT run pnpm build while dev server is running (CLAUDE.md memory).
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../setup/auth";
import {
  provisionAssignmentAsOwner,
  loginAsProvisionedStudent,
  WRITING_SET_NAME,
} from "./provision";
import { completeWritingAssignment, enterFullscreenIfGated } from "./helpers";

test.setTimeout(150_000);

test.describe("TK-30: writing take screen", () => {
  // student20 is unclassed (s15..s21 pool); provision a fresh writing assignment so this block
  // can be re-run without consuming the seed assignment.
  const STUDENT_EMAIL = "student20@e2e.local";

  test.beforeEach(async ({ context }) => {
    await provisionAssignmentAsOwner(context, STUDENT_EMAIL, WRITING_SET_NAME);
    await loginAsProvisionedStudent(context, STUDENT_EMAIL);
  });

  test("TK-30: writing opens straight onto the editor behind the fullscreen gate", async ({
    page,
  }) => {
    await page.goto("/student/assignments");
    await expect(page.getByRole("heading", { level: 1, name: "Bài tập" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("link", { name: "Làm bài" }).first().click();

    // Writing has no mic test — the centre's fullscreen policy is the only thing in front of it.
    await expect(page.getByTestId("skip-mic-btn")).toHaveCount(0);
    const gate = page.getByTestId("fullscreen-enter-btn");
    await expect(gate).toBeVisible({ timeout: 15_000 });
    await gate.click();

    await expect(page.getByPlaceholder("Type your response here…")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("TK-31: submitting leaves fullscreen", () => {
  const STUDENT_EMAIL = "student20@e2e.local";

  test("TK-31: the browser leaves fullscreen once the writing is submitted", async ({ page, context }) => {
    const { assignmentId } = await provisionAssignmentAsOwner(context, STUDENT_EMAIL, WRITING_SET_NAME);
    await loginAsProvisionedStudent(context, STUDENT_EMAIL);
    const violationReports: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/violations")) violationReports.push(r.postData() ?? "");
    });
    await page.goto(`/student/take/${assignmentId}`);

    const isFullscreen = () => page.evaluate(() => !!document.fullscreenElement);
    await enterFullscreenIfGated(page, page.getByPlaceholder("Type your response here…"));
    expect(await isFullscreen()).toBe(true);

    const task1Essay = Array.from({ length: 160 }, (_, i) => `taskone_word${i + 1}`).join(" ");
    const task2Essay = Array.from({ length: 260 }, (_, i) => `tasktwo_word${i + 1}`).join(" ");
    await completeWritingAssignment(page, [task1Essay, task2Essay]);

    await expect(page).toHaveURL("/student/assignments", { timeout: 15_000 });
    await expect.poll(isFullscreen, { timeout: 5_000 }).toBe(false);
    expect(violationReports.join("\n")).not.toContain("exit-fullscreen");
  });
});

// ── Writing submit → scoring → student views result (RES-03/11/12) ────────────

test("submit writing assignment → poll for result → student reviews (RES-03/11/12)", async ({
  page,
  context,
}) => {
  // Self-provision: use student21 (unclassed, from s15..s21 pool).
  // API endpoint POST /tests/:id/assign always sets RequiresTeacherReview=true (hardcoded in
  // handleAssignTest). So after scoring, the result is pending_review (not auto-released).
  // We approve it as owner before the student polls for the result.
  const STUDENT_EMAIL = "student21@e2e.local";
  const { assignmentId } = await provisionAssignmentAsOwner(context, STUDENT_EMAIL, WRITING_SET_NAME);
  await loginAsProvisionedStudent(context, STUDENT_EMAIL);

  // ── 1. Navigate to assignments list ─────────────────────────────────────────
  await page.goto("/student/assignments");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bài tập" }),
  ).toBeVisible({ timeout: 15_000 });

  // ── 2. Open the pending writing assignment ──────────────────────────────────
  const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
  await expect(takeLink).toBeVisible({ timeout: 10_000 });
  await takeLink.click();

  // ── 3. Write both tasks and submit ──────────────────────────────────────────
  // E2E Writing Homework Set has 2 tasks (Task 1 min=150, Task 2 min=250).
  const task1Essay = Array.from({ length: 160 }, (_, i) => `taskone_word${i + 1}`).join(" ");
  const task2Essay = Array.from({ length: 260 }, (_, i) => `tasktwo_word${i + 1}`).join(" ");
  await completeWritingAssignment(page, [task1Essay, task2Essay]);

  // After success → router.push("/student/assignments")
  await expect(page).toHaveURL("/student/assignments", { timeout: 15_000 });

  // ── 4. Owner approves result (RequiresTeacherReview=true → need manual approve) ──
  // The POST /tests/:id/assign endpoint hardcodes RequiresTeacherReview=true.
  // After scoring completes (assignment→scored), the result stays pending_review.
  // We poll for the result to appear in the owner's results list, then approve it.
  const bffBase = process.env.E2E_WEB_BASE ?? "http://localhost:3004";
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1";

  // Get owner access token via BFF
  const ownerLoginRes = await context.request.post(`${bffBase}/api/auth/login`, {
    data: { email: "owner@e2e.local", password: "Test@1234" },
    headers: { Origin: bffBase, "Content-Type": "application/json" },
  });
  const ownerData = await ownerLoginRes.json() as { access_token: string };
  const ownerToken = ownerData.access_token;

  // Poll until the AI has actually scored this result. The row appears as soon as the assignment
  // is submitted, so waiting for the row alone would approve a result with no bands yet — the
  // backend rejects that with scores_incomplete. `band` is the scored signal the LIST carries;
  // ai_scored_at exists only on the detail response.
  let resultId: string | null = null;
  await expect
    .poll(
      async () => {
        const res = await context.request.get(`${apiBase}/results?limit=50`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        if (!res.ok()) return null;
        const results = (await res.json()) as Array<{
          id: string;
          assignment_id: string;
          band?: number | null;
        }>;
        const match = results.find((r) => r.assignment_id === assignmentId);
        if (!match) return null;
        resultId = match.id;
        return match.band ?? null;
      },
      {
        message: "Waiting for the AI score to land on the owner's result",
        timeout: 90_000,
        intervals: [2_000, 3_000, 5_000],
      },
    )
    .toBeTruthy();

  expect(resultId).toBeTruthy();

  // A result the confidence gate failed cannot be approved straight off the AI scores — a teacher
  // has to own it first. Accepting the AI scores unchanged is the shortest form of that review.
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
  await context.request.post(`${apiBase}/results/${resultId}/start-review`, {
    headers: ownerHeaders,
  });
  const detailRes = await context.request.get(`${apiBase}/results/${resultId}`, {
    headers: ownerHeaders,
  });
  expect(detailRes.ok()).toBe(true);
  const detail = (await detailRes.json()) as { ai_result?: unknown; result?: unknown };
  const reviewRes = await context.request.patch(`${apiBase}/results/${resultId}`, {
    headers: { ...ownerHeaders, "Content-Type": "application/json" },
    data: { reviewed_result: detail.ai_result ?? detail.result },
  });
  expect(reviewRes.ok(), `review save failed: ${reviewRes.status()} ${await reviewRes.text()}`).toBe(
    true,
  );

  const approveRes = await context.request.post(`${apiBase}/results/${resultId}/approve`, {
    headers: ownerHeaders,
  });
  expect(approveRes.ok(), `approve failed: ${approveRes.status()} ${await approveRes.text()}`).toBe(
    true,
  );

  // ── 6. Re-login as student and poll for released status ────────────────────
  await loginAsProvisionedStudent(context, STUDENT_EMAIL);
  await page.goto("/student/assignments");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bài tập" }),
  ).toBeVisible({ timeout: 15_000 });

  // Poll for "Có kết quả" badge + view-result-btn to appear
  await expect
    .poll(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);

        const releasedBadge = page.locator("text=Có kết quả").first();
        if ((await releasedBadge.count()) === 0) return null;

        const viewBtn = page.locator("[data-testid^='view-result-btn-']").first();
        if ((await viewBtn.count()) === 0) return null;

        return "released";
      },
      {
        message: "Waiting for writing assignment to show 'Có kết quả' after owner approval",
        timeout: 30_000,
        intervals: [2_000, 3_000],
      },
    )
    .toBeTruthy();

  // ── 7. RES-03: click "Xem kết quả" → StudentResultView opens ───────────────
  const viewBtn = page.locator("[data-testid^='view-result-btn-']").first();
  await expect(viewBtn).toBeVisible({ timeout: 5_000 });
  await viewBtn.click();

  // StudentResultView modal header shows "Kết quả bài thi"
  await expect(page.getByText("Kết quả bài thi")).toBeVisible({ timeout: 10_000 });

  // ── 8. RES-11: Task1/Task2 tab switcher (multi_task writing) ───────────────
  // writing_exam_high.json is multi_task → taskCount > 1 → task buttons shown.
  await expect(page.getByRole("button", { name: "Task 1" }).first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Task 2" }).first()).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: "Task 2" }).first().click();
  await expect(page.getByTestId("essay-highlight")).toBeVisible({ timeout: 5_000 });

  // ── 9. RES-12: essay-highlight + "Bản sửa gợi ý" tab ─────────────────────
  await page.getByRole("button", { name: "Task 1" }).first().click();

  await expect(page.getByTestId("essay-highlight")).toBeVisible({ timeout: 5_000 });

  const fixedTab = page.getByRole("button", { name: "Bản sửa gợi ý" });
  await expect(fixedTab).toBeVisible({ timeout: 5_000 });
  await fixedTab.click();

  await expect(page.getByTestId("essay-highlight")).toBeVisible({ timeout: 3_000 });

  // ── 10. Student read-only footer message ────────────────────────────────────
  // GatedReviewFooter for student (approved=true, isStudent=true) shows:
  // "Kết quả đã được giáo viên duyệt — chỉ xem."
  await expect(
    page.getByText("Kết quả đã được giáo viên duyệt — chỉ xem."),
  ).toBeVisible({ timeout: 5_000 });

  // ── 11. Close modal and re-open the result from the assignments page ─────────
  // Two "Đóng" elements: header icon (aria-label="Đóng") and footer text button.
  // Use .last() to target the footer "Đóng" button (avoids strict-mode violation).
  await page.getByText("Đóng", { exact: true }).last().click();

  // Results are reached through the assignment card (the old /student/results page is gone) — reopen from there.
  await page.goto("/student/assignments");
  const reopenBtn = page.locator("[data-testid^='view-result-btn-']").first();
  await expect(reopenBtn).toBeVisible({ timeout: 10_000 });
  const reopenTestId = await reopenBtn.getAttribute("data-testid");
  const studentAssignmentId = reopenTestId?.replace("view-result-btn-", "") ?? "";
  expect(studentAssignmentId).toBeTruthy();

  // Re-open "Xem kết quả" from the assignments list (RES-03 alternative path)
  await reopenBtn.click();
  await expect(page.getByText("Kết quả bài thi")).toBeVisible({ timeout: 10_000 });

  console.log(`[take-writing] Writing result for assignment ${studentAssignmentId} reviewed by student ✓`);
});
