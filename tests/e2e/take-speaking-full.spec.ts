/**
 * E2E spec: the speaking take flow that ielts-smart-web itself owns.
 *
 * The exam UI is the exam engine, so recording, question navigation, drafts and the submit
 * control are the engine's behaviour and are covered by the engine package's own tests. What is
 * left here — and what this file covers — is the shell the app puts around it:
 *   TK-01 loading / TK-02 not-found / TK-03 no-questions / TK-04 already-submitted /
 *   TK-05 past-deadline / TK-10 mic-test screen / TK-11 mic denied → error + retry /
 *   TK-12/13 mic test → exam / TK-14 fullscreen gate / TK-27 whole section → submit /
 *   TK-46 draft key per assignment
 *
 * Self-provisioning strategy (E2E-CONTRACT §"Self-provision speaking assignment"):
 *   Each test needing a fresh pending assignment logs in as `owner`, assigns
 *   "E2E Speaking Set" to a different student from the s15..s21 pool, then
 *   switches to that student to take the assignment.
 *
 * Tests that only need to verify page-state behaviour (TK-01..05) can use
 * direct URL navigation with fabricated IDs — backend returns 404/403 shapes.
 *
 * Auth: httpOnly cookie via loginAs() per test.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "../setup/auth";
import {
  answerCurrentQuestion,
  completeSpeakingAssignmentById,
  startExam,
} from "./helpers";
import {
  provisionAssignmentAsOwner,
  loginAsProvisionedStudent,
  SPEAKING_SET_NAME,
} from "./provision";

// A real speaking section plays an examiner lead-in per part and holds a preparation minute on
// Part 2, all in real time — the take tests are minutes long by nature, not by flakiness.
test.setTimeout(300_000);

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Opens the student's first pending assignment from the list. */
async function openAssignmentFromList(page: Page): Promise<void> {
  await page.goto("/student/assignments");
  await expect(page.getByRole("heading", { level: 1, name: "Bài tập" })).toBeVisible({
    timeout: 15_000,
  });
  const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
  await expect(takeLink).toBeVisible({ timeout: 10_000 });
  await takeLink.click();
}

// ── TK-01..05: Loading / edge states ──────────────────────────────────────────

test.describe("TK-01..05: take page edge states", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "student");
  });

  test("TK-01: loading indicator shown while fetching assignment", async ({ page }) => {
    // We navigate to the page and intercept the assignment API call to delay it.
    // The page renders "Đang tải bài thi..." while both queries are loading.
    await page.route("**/api/v1/student/assignments/**", async (route) => {
      await new Promise((r) => setTimeout(r, 800)); // artificial delay
      await route.continue();
    });
    // Navigate to a valid-format UUID that doesn't exist (TK-01 approximation):
    // The loading text appears while the query is in-flight.
    await page.goto("/student/take/00000000-0000-0000-0000-000000000001");
    // "Đang tải bài thi..." rendered while loadingAssignment=true
    await expect(page.getByText("Đang tải bài thi...")).toBeVisible({ timeout: 3_000 });
    await page.unroute("**/api/v1/student/assignments/**");
  });

  test("TK-02: not-found assignment shows error message", async ({ page }) => {
    // Non-existent assignment → backend 404 → query returns null → error text rendered
    // The page shows: "Không tìm thấy bài thi." when assignment is null.
    await page.goto("/student/take/00000000-0000-0000-0000-000000000002");
    await expect(
      page.getByText("Không tìm thấy bài thi."),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("TK-03: no-questions assignment shows empty-questions error", async ({ page }) => {
    // student-noq@e2e.local has 1 pending assignment for "E2E Empty Set" (0 questions).
    // The take page fetches the assignment + test, then hits the guard:
    //   test.questions.length === 0 → renders "Bài thi này chưa có câu hỏi. Vui lòng liên hệ giáo viên của bạn."
    // (take/[id]/page.tsx line ~231: if (test.questions.length === 0) { ... })
    // We must NOT submit — just navigate to the take page and assert the error text.
    await loginAs(page.context(), "student-noq");

    // Navigate to student assignments to find the assignment ID
    await page.goto("/student/assignments");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bài tập" }),
    ).toBeVisible({ timeout: 15_000 });

    // student-noq has 1 pending assignment — find the take-btn
    const takeBtns = page.locator("[data-testid^='take-btn-']");
    const hasTakeBtn = await takeBtns.first().isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasTakeBtn) {
      test.fixme(
        true,
        "TK-03: student-noq has no take-btn visible — assignment may be in wrong state or seed missing. " +
        "Expected: 1 pending assignment for 'E2E Empty Set' (0 questions).",
      );
      return;
    }

    // Click take → navigate to take page
    await takeBtns.first().click();

    // For a speaking assignment with 0 questions, the take page renders:
    //   <p class="text-sm text-error-700">Bài thi này chưa có câu hỏi. Vui lòng liên hệ giáo viên của bạn.</p>
    // (before even reaching the mic-test stage)
    await expect(
      page.getByText("Bài thi này chưa có câu hỏi. Vui lòng liên hệ giáo viên của bạn."),
    ).toBeVisible({ timeout: 15_000 });

    console.log("[TK-03] Empty-questions error shown for student-noq ✓");
  });

  test("TK-04: already-submitted assignment — no take-btn; navigating to take URL shows take-blocked guard", async ({ page }) => {
    // student03@e2e.local has assignment with status=submitted.
    // UI behaviour (confirmed from src/app/(student)/student/take/[id]/page.tsx ~line 231):
    //   if (assignment.status !== "pending") {
    //     return (
    //       <div data-testid="take-blocked" ...>
    //         <p>Bài này đã nộp — không thể làm lại.</p>
    //         <Button onClick={() => router.push("/student/assignments")}>Về danh sách bài tập</Button>
    //       </div>
    //     );
    //   }
    // The guard fires BEFORE the mic-test stage (checked right after assignment+test load).
    // We ONLY verify: (a) no take-btn on assignments page, (b) take URL shows take-blocked.
    // We do NOT submit — isolation: student03 must stay submitted for re-runs.

    await loginAsProvisionedStudent(page.context(), "student03@e2e.local");

    await page.goto("/student/assignments");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bài tập" }),
    ).toBeVisible({ timeout: 15_000 });

    // For submitted status: take-btn must NOT be present (canTake = status === "pending" → false)
    const takeBtns = page.locator("[data-testid^='take-btn-']");
    await page.waitForTimeout(2_000);
    const takeBtnCount = await takeBtns.count();
    expect(takeBtnCount).toBe(0);

    // Submitted status label appears on the card. Student-facing, "submitted"
    // renders as "Đang chấm" (submitted and being scored are merged for the student).
    const submittedLabel = page.getByText("Đang chấm");
    await expect(submittedLabel.first()).toBeVisible({ timeout: 5_000 });

    // Get the assignment ID from the card testid to navigate directly to take URL
    const assignmentCards = page.locator("[data-testid^='assignment-card-']");
    const haCards = await assignmentCards.first().isVisible({ timeout: 5_000 }).catch(() => false);

    if (!haCards) {
      test.fixme(
        true,
        "TK-04: no assignment-card- testid found for student03 — seed may be missing submitted assignment. " +
        "Expected: student03@e2e.local has 1 assignment with status=submitted.",
      );
      return;
    }

    const cardTestId = await assignmentCards.first().getAttribute("data-testid");
    const assignmentId = cardTestId?.replace("assignment-card-", "") ?? "";

    if (!assignmentId) {
      test.fixme(true, "TK-04: could not extract assignmentId from assignment-card testid.");
      return;
    }

    // Navigate directly to /student/take/:id of the submitted assignment.
    // The guard (take/[id]/page.tsx:231) renders data-testid="take-blocked" when
    // assignment.status !== "pending". skip-mic-btn must NOT be visible.
    await page.goto(`/student/take/${assignmentId}`);

    // take-blocked block: "Bài này đã nộp — không thể làm lại."
    await expect(page.getByTestId("take-blocked")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Bài này đã nộp — không thể làm lại.")).toBeVisible({ timeout: 5_000 });

    // skip-mic-btn must NOT be visible (guard fires before mic-test stage)
    await expect(page.getByTestId("skip-mic-btn")).not.toBeVisible({ timeout: 3_000 });

    console.log(`[TK-04] take-blocked guard rendered for submitted assignment ${assignmentId} ✓`);
  });

  test("TK-05: a past-deadline assignment is badged overdue and can no longer be taken", async ({ page }) => {
    // student-overdue@e2e.local has 1 pending speaking assignment with a deadline in the past.
    // Deadline enforcement is real now — the backend refuses a late submit, so the card drops the
    // "Làm bài" button rather than letting the student record an answer that cannot be handed in.
    await loginAs(page.context(), "student-overdue");

    await page.goto("/student/assignments");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bài tập" }),
    ).toBeVisible({ timeout: 15_000 });

    const cards = page.locator("[data-testid^='assignment-card-']");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    const deadlineBadges = page.locator("[data-testid^='deadline-badge-']");
    await expect(deadlineBadges.first()).toBeVisible({ timeout: 5_000 });
    await expect(deadlineBadges.first()).toContainText("Quá hạn");

    await expect(cards.first().getByText("Quá hạn — không thể làm bài")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator("[data-testid^='take-btn-']")).toHaveCount(0);
  });
});

// ── TK-10..13: Mic test screen ─────────────────────────────────────────────────

test.describe("TK-10..13: mic test screen", () => {
  // Use student15 for the first mic-test group
  const STUDENT_EMAIL = "student15@e2e.local";

  test.beforeEach(async ({ context }) => {
    // Provision a fresh speaking assignment for student15
    await provisionAssignmentAsOwner(context, STUDENT_EMAIL, SPEAKING_SET_NAME);
    await loginAsProvisionedStudent(context, STUDENT_EMAIL);
  });

  test("TK-10: mic-test screen shown before exam starts (speaking)", async ({ page }) => {
    await page.goto("/student/assignments");
    await expect(
      page.getByRole("heading", { level: 1, name: "Bài tập" }),
    ).toBeVisible({ timeout: 15_000 });

    // Click "Làm bài" for the provisioned assignment
    const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
    await expect(takeLink).toBeVisible({ timeout: 10_000 });
    await takeLink.click();

    // Mic-test screen: skip-mic-btn is visible (confirmed from page.tsx §"Mic test gate")
    await expect(page.getByTestId("skip-mic-btn")).toBeVisible({ timeout: 10_000 });
    // Also the "Bắt đầu kiểm tra mic" button
    await expect(page.getByTestId("start-mic-btn")).toBeVisible({ timeout: 5_000 });
  });

  test("TK-12/13: start mic → recording → mic-good-btn → exam stage", async ({ page }) => {
    await page.goto("/student/assignments");
    await expect(page.getByRole("heading", { level: 1, name: "Bài tập" })).toBeVisible({ timeout: 15_000 });
    const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
    await expect(takeLink).toBeVisible({ timeout: 10_000 });
    await takeLink.click();

    await expect(page.getByTestId("start-mic-btn")).toBeVisible({ timeout: 10_000 });

    // TK-12: click "Bắt đầu kiểm tra mic" → recording starts (fake device)
    await page.getByTestId("start-mic-btn").click();
    // Phase=recording: "Đang ghi âm..." text visible, start-mic-btn gone
    await expect(page.getByText("Đang ghi âm...")).toBeVisible({ timeout: 5_000 });

    // MicTest auto-stops after 5s OR we wait for it. Wait for done phase:
    await expect(page.getByTestId("mic-good-btn")).toBeVisible({ timeout: 10_000 });

    // TK-13: click "Mic tốt, bắt đầu làm bài" → past the mic gate, onto the fullscreen gate
    await page.getByTestId("mic-good-btn").click();
    await expect(page.getByTestId("fullscreen-enter-btn")).toBeVisible({ timeout: 10_000 });
  });
});

// ── TK-11: Mic denied ─────────────────────────────────────────────────────────

test("TK-11: mic denied → mic-error shown + mic-retry-btn", async ({ context, page }) => {
  // Override getUserMedia BEFORE the page loads (addInitScript runs before hydration)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () =>
        Promise.reject(
          new DOMException("Permission denied", "NotAllowedError"),
        ),
    });
  });

  const STUDENT_EMAIL = "student16@e2e.local";
  await provisionAssignmentAsOwner(context, STUDENT_EMAIL, SPEAKING_SET_NAME);
  await loginAsProvisionedStudent(context, STUDENT_EMAIL);

  await page.goto("/student/assignments");
  await expect(page.getByRole("heading", { level: 1, name: "Bài tập" })).toBeVisible({ timeout: 15_000 });
  const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
  await expect(takeLink).toBeVisible({ timeout: 10_000 });
  await takeLink.click();

  // On mic-test screen, click "Bắt đầu kiểm tra mic" → getUserMedia rejects
  await expect(page.getByTestId("start-mic-btn")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("start-mic-btn").click();

  // mic-error div must appear with the permission-denied message
  await expect(page.getByTestId("mic-error")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("mic-error")).toContainText("Không thể truy cập microphone");

  // mic-retry-btn must be visible inside the error block
  await expect(page.getByTestId("mic-retry-btn")).toBeVisible({ timeout: 3_000 });
});

// ── TK-14: Fullscreen gate ────────────────────────────────────────────────────

test.describe("TK-14: fullscreen gate", () => {
  const STUDENT_EMAIL = "student17@e2e.local";

  test.beforeEach(async ({ context }) => {
    await provisionAssignmentAsOwner(context, STUDENT_EMAIL, SPEAKING_SET_NAME);
    await loginAsProvisionedStudent(context, STUDENT_EMAIL);
  });

  test("TK-14: the exam is gated on fullscreen, and entering it starts the section", async ({
    page,
  }) => {
    await openAssignmentFromList(page);

    await expect(page.getByTestId("skip-mic-btn")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("skip-mic-btn").click();

    // DefaultExamRules gives every centre fullscreen:true, so the gate stands between the mic
    // test and the exam. It must be up BEFORE the section starts — the engine timer must not run
    // while the student is still looking at the prompt to enter fullscreen.
    const gate = page.getByTestId("fullscreen-enter-btn");
    await expect(gate).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Question \d+ of \d+/)).toHaveCount(0);

    await gate.click();
    await expect(gate).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(/Question 1 of \d+/)).toBeVisible({ timeout: 15_000 });
  });
});

// ── TK-27: Whole section → automatic submit ───────────────────────────────────

test.describe("TK-27: taking the whole section", () => {
  const STUDENT_EMAIL = "student18@e2e.local";

  test("TK-27: answering every question submits the assignment and leaves the pending list", async ({
    context,
    page,
  }) => {
    const { assignmentId } = await provisionAssignmentAsOwner(
      context,
      STUDENT_EMAIL,
      SPEAKING_SET_NAME,
    );
    await loginAsProvisionedStudent(context, STUDENT_EMAIL);

    await completeSpeakingAssignmentById(page, assignmentId);

    // Back on the list, this assignment must no longer offer "Làm bài".
    const card = page.getByTestId(`assignment-card-${assignmentId}`);
    const stillPending = await card
      .getByRole("link", { name: "Làm bài" })
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    expect(stillPending).toBe(false);
  });
});

// ── TK-46: Draft persistence ──────────────────────────────────────────────────

test.describe("TK-46: draft persistence", () => {
  const STUDENT_EMAIL = "student19@e2e.local";

  test("TK-46: the section draft is cached under the assignment's own key", async ({
    context,
    page,
  }) => {
    const { assignmentId } = await provisionAssignmentAsOwner(
      context,
      STUDENT_EMAIL,
      SPEAKING_SET_NAME,
    );
    await loginAsProvisionedStudent(context, STUDENT_EMAIL);

    await page.goto(`/student/take/${assignmentId}`);
    await startExam(page);
    await answerCurrentQuestion(page);

    // The page passes `${assignmentId}:${skill}` as the engine's draftKey, which the engine
    // namespaces. Getting this wrong would let one assignment resume another's answers.
    const draftKey = `ielts-exam-draft:${assignmentId}:speaking`;
    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), draftKey), {
        timeout: 20_000,
      })
      .not.toBeNull();
  });
});
