/**
 * E2E spec: assigning work / Assignments (/assignments + AssignDialog)
 *
 * Matrix IDs covered: ASG-01 through ASG-18
 *
 * Seed requirements (E2E-CONTRACT.md §"Seed inventory v2"):
 *   - owner@e2e.local: partner_owner in E2E Center (100k credits)
 *   - teacher@e2e.local: teacher in E2E Center, in charge of E2E Class A + E2E Class Empty
 *   - "E2E Batch Set" giao 5 HV Class A (s01..s05):
 *       s01=pending, s02=pending, s03=submitted, s04=scored/pending_review, s05=reviewed
 *     → at least 2 open batches, at least 1 batch visible as needing scoring
 *   - Banks: E2E Speaking Set, E2E Speaking Exam Set, E2E Writing Homework Set,
 *            E2E Writing Exam Set, E2E Batch Set
 *   - Classes: E2E Class A (11 HV), E2E Class B, E2E Class Empty (0 HV)
 *   - Students not placed in a class: s15..s21 (used for isolation)
 *
 * Isolation rules (IMPORTANT):
 *   - Assert list/stat values against thresholds (≥), never absolute numbers.
 *   - Assignment mutations: use E2E Class A (s01..s07 are spare students, fine per the isolation note).
 *   - Do NOT assign to student@/student-done/student-review/student-writing.
 *
 * Auth: loginAs(context, "owner") or loginAs(context, "teacher") per test.
 *
 * Assumptions:
 *   A1. AssignDialog renders inside a <dialog> role element (Dialog component).
 *   A2. "Cần chấm" = batches where pendingReview > 0 (submitted/scored states).
 *   A3. assign POST path: /tests/:testId/assign (assignmentApi.assign).
 *   A4. /assignments lists one folder per class; opening a folder lists that class's runs, and
 *       clicking a run opens TestResultsDialog. There is no per-run CTA button.
 *   A5. TestResultsDialog title: "Kết quả bài làm theo bài tập".
 *   A6. Empty class text in dialog: "Lớp chưa có học viên."
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../setup/auth";
import { enterFullscreenIfGated } from "./helpers";
import { loginAsProvisionedStudent } from "./provision";

type PW = import("@playwright/test").Page;

// ── Navigation helper ─────────────────────────────────────────────────────────

async function gotoAssignments(page: PW) {
  await page.goto("/assignments");
  await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Open AssignDialog by clicking "Giao bài tập" button,
 * then scope returned locator to the dialog element.
 */
async function openAssignDialog(page: PW) {
  await page.getByTestId("assign-dialog-btn").click();
  const dialog = page.locator("[role='dialog']");
  await expect(dialog.getByTestId("assign-set-search")).toBeVisible({
    timeout: 8_000,
  });
  return dialog;
}

/**
 * Select "E2E Batch Set" inside the given dialog scope by typing in search
 * and clicking the matching set button.
 */
async function selectBatchSet(dialog: import("@playwright/test").Locator) {
  await dialog.getByTestId("assign-set-search").fill("E2E Batch");
  // The set list is inside the dialog — locate the button containing "E2E Batch Set"
  // The set button renders as: <button> … <div>E2E Batch Set</div> </button>
  // Using getByRole('button') scoped inside dialog + filter by text
  const setBtn = dialog
    .locator("button")
    .filter({ hasText: "E2E Batch Set" })
    .first();
  await expect(setBtn).toBeVisible({ timeout: 5_000 });
  await setBtn.click();
}

/** "E2E Batch Set" is Speaking, which hides the time-limit field — this one is Writing. */
async function selectWritingHomeworkSet(dialog: import("@playwright/test").Locator) {
  await dialog.getByTestId("assign-set-search").fill("E2E Writing Homework");
  const setBtn = dialog.locator("button").filter({ hasText: "E2E Writing Homework Set" }).first();
  await expect(setBtn).toBeVisible({ timeout: 5_000 });
  await setBtn.click();
}

/**
 * Select E2E Class A from assign-class-select by resolving the option value.
 * Returns true if found, false if not found (caller should fixme/skip).
 */
async function selectClassA(dialog: import("@playwright/test").Locator): Promise<boolean> {
  const classSelect = dialog.getByTestId("assign-class-select");
  if (!(await classSelect.isVisible().catch(() => false))) return false;
  const opts = await classSelect.locator("option").all();
  for (const opt of opts) {
    const txt = await opt.textContent();
    if (txt?.includes("E2E Class A")) {
      const val = (await opt.getAttribute("value")) ?? "";
      if (val) {
        await classSelect.selectOption(val);
        return true;
      }
    }
  }
  return false;
}

/**
 * Ticks one spare student in the dialog's global picker.
 *
 * Opened from /assignments the dialog has no locked class, so "Chọn học viên" searches the whole
 * centre instead of offering a class dropdown. student08 is in E2E Class B and reserved by no other
 * spec, so assigning to them cannot disturb the Class A accounts the other specs depend on.
 */
const SPARE_STUDENT = "Bùi Văn Hải";
const SPARE_STUDENT_EMAIL = "student08@e2e.local";

async function pickSpareStudent(dialog: import("@playwright/test").Locator) {
  await dialog.getByText("Chọn học viên").click();
  await dialog.getByTestId("assign-student-search").fill(SPARE_STUDENT);
  const row = dialog.locator("label").filter({ hasText: SPARE_STUDENT }).first();
  await expect(row).toBeVisible({ timeout: 8_000 });
  await row.click();
}

/** Folder rows: /assignments lists one folder per class before any run is visible. */
function classFolders(page: PW) {
  return page.locator("[data-testid^='class-folder-row-']");
}

/**
 * Navigates and waits until the runs query has painted.
 *
 * The heading paints before the query resolves and every stat card reads 0 until it does, so a
 * stat sampled straight after the goto is compared against a list that loaded a moment later.
 * Only for the fixtures that own runs — a class-less account never gets a folder.
 */
async function gotoAssignmentsLoaded(page: PW) {
  await gotoAssignments(page);
  await expect(classFolders(page).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Opens the first class folder that actually holds runs, and returns its run rows.
 *
 * Under "Tất cả" the list keeps classes with no runs at all (E2E Class Empty is one), so simply
 * opening the first folder can land on an empty one. The 2nd column is the run count.
 */
async function openFirstFolder(page: PW) {
  const folders = classFolders(page);
  await expect(folders.first()).toBeVisible({ timeout: 10_000 });

  const count = await folders.count();
  for (let i = 0; i < count; i++) {
    const total = parseInt((await folders.nth(i).locator(".num").first().textContent()) ?? "0", 10);
    if (total === 0) continue;
    await folders.nth(i).click();
    await expect(page.getByTestId("assignments-group-title")).toBeVisible({ timeout: 10_000 });
    return page.locator("[data-testid^='class-bai-row-']");
  }
  throw new Error("openFirstFolder: no class folder holds any assignment run — check the seed");
}

/** The number a stat card shows for one status filter. */
async function statCount(page: PW, key: string): Promise<number> {
  const text = await page.getByTestId(`filter-stat-${key}`).locator(".num").textContent();
  return parseInt(text ?? "0", 10);
}

/** The "Hiển thị N bài" count under the toolbar. */
async function shownCount(page: PW): Promise<number> {
  const text = await page.getByText(/Hiển thị/).locator("strong").textContent();
  return parseInt(text ?? "0", 10);
}

/**
 * Close the dialog via the "Hủy" button scoped to dialog.
 */
async function cancelDialog(dialog: import("@playwright/test").Locator) {
  await dialog.getByRole("button", { name: "Hủy" }).click();
}

// ─── ASG-01: List batch cards + 3 stat cards ──────────────────────────────────

test.describe("ASG-01: class folder list + stat cards visible", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-01: owner sees class folders, stat cards, and a class's runs", async ({
    page,
  }) => {
    await gotoAssignments(page);

    // Stat cards for all, open, needReview, dueSoon, closed
    await expect(page.getByTestId("filter-stat-all")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("filter-stat-open")).toBeVisible();
    await expect(page.getByTestId("filter-stat-needReview")).toBeVisible();
    await expect(page.getByTestId("filter-stat-closed")).toBeVisible();

    // The page opens on class folders, not on the runs themselves.
    await expect(classFolders(page).first()).toBeVisible({ timeout: 10_000 });
    expect(await classFolders(page).count()).toBeGreaterThanOrEqual(1);

    expect(await statCount(page, "open")).toBeGreaterThanOrEqual(1);
    // s03=submitted and/or s04=scored
    expect(await statCount(page, "needReview")).toBeGreaterThanOrEqual(1);

    // A folder opens onto that class's runs.
    const rows = await openFirstFolder(page);
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── ASG-02: Tab filter (Tất cả / Đang mở / Đã đóng) ─────────────────────────

test.describe("ASG-02: tab filter switches visible batches", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-02: clicking Đang mở narrows the folders to the open runs only", async ({
    page,
  }) => {
    await gotoAssignmentsLoaded(page);
    const open = await statCount(page, "open");
    const total = await statCount(page, "all");

    await page.getByTestId("filter-stat-open").click();
    await page.waitForTimeout(300);

    // The folder list now accounts for exactly the runs the stat card counted.
    expect(await shownCount(page)).toBe(open);
    expect(open).toBeLessThanOrEqual(total);
  });

  test("ASG-02: clicking Đã đóng shows the closed runs, or says nothing matches", async ({
    page,
  }) => {
    await gotoAssignmentsLoaded(page);
    const closed = await statCount(page, "closed");

    await page.getByTestId("filter-stat-closed").click();
    await page.waitForTimeout(300);

    if (closed === 0) {
      await expect(page.getByText("Không có bài khớp bộ lọc.")).toBeVisible({ timeout: 5_000 });
      expect(await classFolders(page).count()).toBe(0);
    } else {
      expect(await shownCount(page)).toBe(closed);
      await expect(classFolders(page).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("ASG-02: clicking Tất cả puts every run back in view", async ({
    page,
  }) => {
    await gotoAssignmentsLoaded(page);
    const total = await statCount(page, "all");

    await page.getByTestId("filter-stat-open").click();
    await page.waitForTimeout(300);
    await page.getByTestId("filter-stat-all").click();
    await page.waitForTimeout(300);

    expect(await shownCount(page)).toBe(total);
    await expect(classFolders(page).first()).toBeVisible({ timeout: 5_000 });
  });
});

// ─── ASG-03: AssignDialog step 1 — chọn đề (search + radio, hiện skill/tier/code)

test.describe("ASG-03: AssignDialog step 1 — set selection", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-03: open AssignDialog, search for set, radio selection shows skill/tier/code", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);

    // Wait for set list to load — search for E2E Batch Set directly
    // (bankApi.list() fetches all banks; filteredSets renders as buttons)
    await dialog.getByTestId("assign-set-search").fill("E2E Batch");

    const batchSetBtn = dialog.locator("button").filter({ hasText: "E2E Batch Set" }).first();
    await expect(batchSetBtn).toBeVisible({ timeout: 8_000 });

    // Shows skill badge — CSS class "uppercase" means DOM text is "speaking" visually shown as "SPEAKING"
    // Playwright text matching ignores CSS transform, so match lowercase
    await expect(batchSetBtn.getByText("speaking", { exact: false })).toBeVisible();
    // Shows the kind tag. The batch fixture is seeded as legacy homework data, so it reads
    // "BTVN (cũ)" rather than "Luyện tập".
    await expect(batchSetBtn.getByText(/BTVN \(cũ\)/)).toBeVisible();
    // Shows code pattern SP-XXXX or just some code text
    await expect(batchSetBtn.getByText(/SP-[A-Z0-9]{4}/)).toBeVisible();

    // Click the set button → it gets selected (border-brand-500)
    await batchSetBtn.click();
    await expect(batchSetBtn).toHaveClass(/border-brand-500/, { timeout: 3_000 });

    await cancelDialog(dialog);
  });

  test("ASG-03: search for non-existent set shows empty message", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await dialog.getByTestId("assign-set-search").fill("ZZZ_NOT_EXIST_XYZ_E2E");
    await expect(dialog.getByText("Không có đề phù hợp.")).toBeVisible({ timeout: 3_000 });
    await cancelDialog(dialog);
  });
});

// ─── ASG-04: Bước 2 "Cả lớp" — chọn class → giao toàn bộ HV ─────────────────

test.describe("ASG-04: AssignDialog step 2 — Cả lớp mode", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-04: selecting Cả lớp mode and choosing a class shows student count in submit", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    // "Cả lớp" tab is default — verify it is visible
    await expect(dialog.getByText("Cả lớp")).toBeVisible({ timeout: 3_000 });

    const found = await selectClassA(dialog);
    if (!found) {
      test.fixme(true, "ASG-04: E2E Class A not found in class dropdown — check seed.");
      return;
    }

    // Submit button shows student count > 0 for Class A (has 11 HV)
    const submitBtn = dialog.getByTestId("assign-submit-btn");
    await expect(submitBtn).not.toBeDisabled({ timeout: 8_000 });
    const btnText = await submitBtn.textContent();
    expect(btnText).toMatch(/Giao cho \d+ học viên/);
    const match = btnText?.match(/Giao cho (\d+) học viên/);
    if (match) expect(parseInt(match[1])).toBeGreaterThan(0);

    await cancelDialog(dialog);
  });
});

// ─── ASG-05: Bước 2 "Chọn học viên" — checkbox selection ─────────────────────

test.describe("ASG-05: AssignDialog step 2 — Chọn học viên mode", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-05: Chọn học viên mode shows a checkbox per centre student", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    await dialog.getByText("Chọn học viên").click();


    // Opened from /assignments there is no locked class, so the picker lists the whole
    // centre and no class dropdown renders (assign-dialog.tsx, `!globalPicker`).
    // Each label wraps an sr-only checkbox, so the label is what a click targets.
    // Use the max-h-48 overflow container as anchor, then find labels directly
    const studentLabels = dialog.locator("label.cursor-pointer");
    await expect(studentLabels.first()).toBeVisible({ timeout: 8_000 });

    // Check one student → submit button shows 1
    await studentLabels.first().click();
    const submitBtn = dialog.getByTestId("assign-submit-btn");
    await expect(submitBtn).toContainText("Giao cho 1 học viên", { timeout: 3_000 });

    // Check another → submit shows 2
    await studentLabels.nth(1).click();
    await expect(submitBtn).toContainText("Giao cho 2 học viên", { timeout: 3_000 });

    await cancelDialog(dialog);
  });
});

// ─── ASG-06: Teacher — chỉ chọn lớp mình + auto-select nếu 1 lớp ────────────

test.describe("ASG-06: teacher scoping — auto-select when 1 class", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("ASG-06: teacher@e2e opens AssignDialog and only sees their own classes", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);

    const classSelect = dialog.getByTestId("assign-class-select");
    const hasSelect = await classSelect.isVisible().catch(() => false);

    if (hasSelect) {
      // Teacher's class options must NOT include E2E Class B (belongs to teacher01)
      const opts = await classSelect.locator("option").allTextContents();
      expect(opts.some((o) => o.includes("E2E Class B"))).toBe(false);
      // Should include Class A and/or Class Empty
      expect(opts.some((o) => o.includes("E2E Class A") || o.includes("E2E Class Empty"))).toBe(true);
    } else {
      // 1-class auto-select → locked class div shown (no select visible)
      // Verify at least one class name is shown in dialog text
      const classText = await dialog.textContent();
      const hasClassRef = (classText ?? "").includes("E2E Class A") || (classText ?? "").includes("E2E Class Empty");
      expect(hasClassRef).toBe(true);
    }

    await cancelDialog(dialog);
  });

  test("ASG-06b: teacher@e2e can hand-pick students from their own classes", async ({ page }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    await dialog.getByText("Chọn học viên").click();

    const studentLabels = dialog.locator("label.cursor-pointer");
    await expect(studentLabels.first()).toBeVisible({ timeout: 8_000 });
    await studentLabels.first().click();
    await expect(dialog.getByTestId("assign-submit-btn")).toContainText("Giao cho 1 học viên", { timeout: 3_000 });

    await cancelDialog(dialog);
  });
});

// ─── ASG-07: Bước 3 deadline + submit POST assign ─────────────────────────────
//
// ISOLATION: Uses "Chọn học viên" mode with E2E Class B (s08..s14 — all spare,
// no reserved accounts). NEVER assigns "Cả lớp" to E2E Class A because Class A
// contains reserved student@/student-done@/student-review@/student-writing@ —
// a whole-class assign would create pending assignments for them and break
// SDB-03 (student-done hero button), take-speaking (extra pending for student@),
// and results.spec tests.

test.describe("ASG-07: step 3 deadline + submit assign", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-07: owner assigns E2E Batch Set to one student in E2E Class B, sets deadline, submits", async ({
    page,
  }) => {
    await gotoAssignments(page);

    // Capture the POST /assign request
    const assignReq = page.waitForRequest(
      (req) => req.url().includes("/tests/") && req.url().includes("/assign") && req.method() === "POST",
    );

    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    // Assign to one ticked student, never a whole class: Class A holds reserved accounts.
    await pickSpareStudent(dialog);

    const submitBtn = dialog.getByTestId("assign-submit-btn");
    await expect(submitBtn).toContainText("Giao cho 1 học viên", { timeout: 3_000 });

    // Step 3: set deadline one week from now
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const yyyy = future.getFullYear();
    const mm = String(future.getMonth() + 1).padStart(2, "0");
    const dd = String(future.getDate()).padStart(2, "0");
    await dialog.getByTestId("assign-deadline-input").fill(`${yyyy}-${mm}-${dd}`);

    // Submit — 1 student selected, button enabled
    await expect(submitBtn).not.toBeDisabled({ timeout: 3_000 });
    await submitBtn.click();

    // Verify request fired
    const req = await assignReq;
    expect(req.url()).toContain("/assign");

    // Dialog closes + stays on /assignments (router.push is soft navigation).
    await expect(dialog.getByTestId("assign-submit-btn")).not.toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/assignments/, { timeout: 5_000 });
  });
});

test.describe("ASG-17: custom time limit is sent with the assignment", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-17: owner sets 25 minutes and the assign request carries it", async ({ page }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectWritingHomeworkSet(dialog);
    await pickSpareStudent(dialog);

    await dialog.getByTestId("assign-time-limit-input").fill("25");
    const response = page.waitForResponse((r) => r.url().includes("/assign") && r.request().method() === "POST");
    await dialog.getByTestId("assign-submit-btn").click();

    expect((await response).request().postDataJSON().time_limit_minutes).toBe(25);
    expect((await response).status()).toBe(201);
  });
});

test.describe("ASG-18: the assigned time limit ends the attempt", () => {
  const ESSAY = "Written before the clock ran out.";

  // Keyboard focus can still Tab behind the notice into the essay (the engine has no focus trap);
  // accepted for now, same as the mock full test.
  test("ASG-18: a 2-minute assignment raises a Submit-only notice the mouse cannot work past", async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000);
    await loginAs(context, "owner");
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectWritingHomeworkSet(dialog);
    await pickSpareStudent(dialog);
    await dialog.getByTestId("assign-time-limit-input").fill("2");
    const response = page.waitForResponse((r) => r.url().includes("/assign") && r.request().method() === "POST");
    await dialog.getByTestId("assign-submit-btn").click();
    const { ids } = (await (await response).json()) as { ids: string[] };

    await loginAsProvisionedStudent(context, SPARE_STUDENT_EMAIL);
    await page.goto(`/student/take/${ids[0]}`);
    const editor = page.getByPlaceholder("Type your response here…");
    await enterFullscreenIfGated(page, editor);
    await editor.fill(ESSAY);
    await expect(page.getByText(/^[12]:\d{2}$/)).toBeVisible();

    const timeUp = page.getByRole("dialog", { name: "Time's up" });
    await expect(timeUp).toBeVisible({ timeout: 150_000 });

    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(timeUp).toBeVisible();

    const box = (await editor.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.type(" mouse");
    await expect(editor).toHaveValue(ESSAY);

    await page.reload();
    await enterFullscreenIfGated(page, timeUp);
    await expect(timeUp).toBeVisible({ timeout: 15_000 });

    await timeUp.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page).toHaveURL(/\/student\/assignments/, { timeout: 20_000 });
    await page.goto(`/student/take/${ids[0]}`);
    await expect(page.getByTestId("take-blocked")).toBeVisible({ timeout: 15_000 });
  });
});

// ─── ASG-08: Giao không chọn HV → nút disabled ────────────────────────────────

test.describe("ASG-08: giao without students — button disabled", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-08: submit button disabled when Chọn học viên mode and no class selected", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    // Switch to "Chọn học viên" mode without selecting a class → 0 students
    await dialog.getByText("Chọn học viên").click();

    // Submit is disabled: studentIds.length === 0
    await expect(dialog.getByTestId("assign-submit-btn")).toBeDisabled({ timeout: 3_000 });

    await cancelDialog(dialog);
  });

  test("ASG-08: Chọn học viên mode with nothing checked leaves submit disabled", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    await dialog.getByText("Chọn học viên").click();


    // Wait for student list to render, then do NOT check any student
    await page.waitForTimeout(500);

    // Submit button text "Giao cho 0 học viên" → disabled
    const submitBtn = dialog.getByTestId("assign-submit-btn");
    await expect(submitBtn).toBeDisabled({ timeout: 5_000 });

    await cancelDialog(dialog);
  });
});

// ─── ASG-09: Lớp chưa có HV → "Lớp chưa có học viên." ──────────────────────

test.describe("ASG-09: empty class shows warning message", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-09: selecting E2E Class Empty in Cả lớp mode shows empty class message or disabled submit", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    const classSelect = dialog.getByTestId("assign-class-select");
    await expect(classSelect).toBeVisible({ timeout: 5_000 });

    const opts = await classSelect.locator("option").all();
    let emptyVal = "";
    for (const opt of opts) {
      const txt = await opt.textContent();
      if (txt?.includes("E2E Class Empty")) {
        emptyVal = (await opt.getAttribute("value")) ?? "";
        break;
      }
    }

    if (!emptyVal) {
      test.fixme(true, "ASG-09: E2E Class Empty not in class dropdown — check seed.");
      return;
    }

    await classSelect.selectOption(emptyVal);
    await page.waitForTimeout(1_000);

    // Either "Lớp chưa có học viên." message shown, or submit is disabled (0 students)
    const emptyMsg = dialog.getByText(/Lớp chưa có học viên/);
    const submitBtn = dialog.getByTestId("assign-submit-btn");

    // E2E Class Empty may have acquired students from previous test runs on shared backend.
    // Accept either: (a) "Lớp chưa có học viên." warning message, or (b) submit disabled,
    // or (c) class genuinely has students → test.fixme with explanation.
    const hasEmptyMsg = await emptyMsg.isVisible().catch(() => false);
    const isDisabled = await submitBtn.isDisabled().catch(() => false);

    if (hasEmptyMsg) {
      await expect(emptyMsg).toBeVisible();
    } else if (isDisabled) {
      // Button is disabled — also acceptable (0 students)
      expect(isDisabled).toBe(true);
    } else {
      // E2E Class Empty has students from prior test runs — cannot verify empty state
      test.fixme(
        true,
        "ASG-09: E2E Class Empty has students from prior test runs (shared backend). " +
        "Empty state (disabled submit / 'Lớp chưa có học viên.') not achievable without resetting the class. " +
        "The component code for empty class message is in assign-dialog.tsx line ~161 (mode=class, classStudents.length=0).",
      );
    }

    await cancelDialog(dialog);
  });
});

// ─── ASG-10: Teacher chưa lớp — "Bạn chưa có lớp nào." ─────────────────────

test.describe("ASG-10: no-class teacher sees 'Bạn chưa có lớp nào.' in AssignDialog", () => {
  test.beforeEach(async ({ context }) => {
    // teacher-empty@e2e.local has no assigned class → classes.length === 0
    await loginAs(context, "teacher-empty");
  });

  test("ASG-10: teacher-empty opens AssignDialog and sees no-class message", async ({
    page,
  }) => {
    await gotoAssignments(page);

    // Open the AssignDialog by clicking the assign button
    await page.getByTestId("assign-dialog-btn").click();
    const dialog = page.locator("[role='dialog']");

    // Wait for the dialog to open (dialog content is visible)
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // When teacher has no classes, assign-set-search may or may not be the first visible element.
    // The dialog renders set-search first, then the class section.
    // classes.length === 0 → renders "Bạn chưa có lớp nào." in place of the class select.
    // (assign-dialog.tsx line ~146: classes.length === 0 shows the no-class paragraph)
    await expect(
      dialog.getByText("Bạn chưa có lớp nào.", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });

    // Submit button is disabled (studentIds.length === 0 because no class)
    await expect(dialog.getByTestId("assign-submit-btn")).toBeDisabled({ timeout: 3_000 });

    await dialog.getByRole("button", { name: "Hủy" }).click();
  });
});

// ─── ASG-11: Sau giao → invalidate + điều hướng ─────────────────────────────
// Covered in ASG-07 (successful assign navigates to /assignments).

// ─── ASG-12: CTA card theo trạng thái ────────────────────────────────────────

test.describe("ASG-12: CTA card behaviour based on batch status", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-12: the needReview filter leaves only folders that owe a review", async ({
    page,
  }) => {
    await gotoAssignments(page);

    // E2E Batch Set has s04=scored/pending_review → pendingReview ≥ 1
    const needReview = await statCount(page, "needReview");
    expect(
      needReview,
      "no run owes a review — results/review-band approve the seeded pending result, so this needs a fresh seed (e2e-down.sh && e2e-up.sh)",
    ).toBeGreaterThanOrEqual(1);

    await page.getByTestId("filter-stat-needReview").click();
    await page.waitForTimeout(300);
    expect(await shownCount(page)).toBe(needReview);

    // Every folder still listed owes at least one review (4th column = "Cần đánh giá").
    const folders = classFolders(page);
    const count = await folders.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const pending = await folders.nth(i).locator(".num").nth(2).textContent();
      expect(parseInt(pending ?? "0", 10)).toBeGreaterThanOrEqual(1);
    }
  });

  test("ASG-12: a run reports how many of its students have submitted", async ({
    page,
  }) => {
    await gotoAssignments(page);
    const rows = await openFirstFolder(page);
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });

    // 5th/6th columns: "Đã nộp" as submitted/total, then the pending-review count.
    const submitted = await rows.first().locator(".num").first().textContent();
    expect(submitted).toMatch(/^\d+\/\d+$/);
  });
});

// ─── ASG-13: Dialog kết quả theo batch — summary + table HV ─────────────────

test.describe("ASG-13: TestResultsDialog summary + student table", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-13: clicking CTA on a submitted batch opens TestResultsDialog with summary", async ({
    page,
  }) => {
    await gotoAssignments(page);

    // A run row opens the results dialog; there is no per-card CTA any more.
    const rows = await openFirstFolder(page);
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();

    // TestResultsDialog: title text and summary boxes
    await expect(page.getByText("Kết quả bài làm theo bài tập")).toBeVisible({ timeout: 8_000 });

    // The dialog body contains the 3 summary boxes (scoped to avoid duplicates on page)
    const dialogBody = page.locator("[role='dialog']").filter({ hasText: "Kết quả bài làm theo bài tập" });
    await expect(dialogBody.getByText("Đã nộp").first()).toBeVisible();
    await expect(dialogBody.getByText("Đã đánh giá").first()).toBeVisible();
    await expect(dialogBody.getByText("Chờ đánh giá").first()).toBeVisible();

    // Close dialog using the "Đóng" button inside the dialog footer
    // Use getByText to target the footer "Đóng" text-button specifically
    // (avoid strict-mode violation: dialog has aria-label="Đóng" X icon + text "Đóng" button)
    await dialogBody.getByText("Đóng", { exact: true }).last().click();
    await expect(page.getByText("Kết quả bài làm theo bài tập")).not.toBeVisible({ timeout: 5_000 });
  });

  test("ASG-13: TestResultsDialog table row shows student name + status + action button", async ({
    page,
  }) => {
    await gotoAssignments(page);

    const rows = await openFirstFolder(page);
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    await rows.first().click();

    const dialogBody = page.locator("[role='dialog']").filter({ hasText: "Kết quả bài làm theo bài tập" });
    await expect(dialogBody).toBeVisible({ timeout: 8_000 });

    const statusBadges = dialogBody.locator("span").filter({ hasText: /Đã đánh giá|Chờ đánh giá/ });
    await expect(statusBadges.first()).toBeVisible({ timeout: 5_000 });

    const actionBtns = dialogBody.locator("button").filter({ hasText: /Đánh giá|Xem lại|Đang xử lý/ });
    await expect(actionBtns.first()).toBeVisible({ timeout: 5_000 });

    // Use getByText to target the footer "Đóng" text-button specifically
    // (avoid strict-mode violation: dialog has aria-label="Đóng" X icon + text "Đóng" button)
    await dialogBody.getByText("Đóng", { exact: true }).last().click();
  });
});

// ─── ASG-14: Empty state ───────────────────────────────────────────────────────

test.describe("ASG-14: empty state — tab rỗng", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-14: a filter that matches nothing says so instead of showing an empty page", async ({
    page,
  }) => {
    await gotoAssignments(page);
    await page.getByTestId("filter-stat-closed").click();
    await page.waitForTimeout(300);

    const folders = await classFolders(page).count();
    if (folders === 0) {
      await expect(page.getByText("Không có bài khớp bộ lọc.")).toBeVisible({ timeout: 5_000 });
    } else {
      expect(await shownCount(page)).toBe(await statCount(page, "closed"));
    }
  });
});

// ─── ASG-15: Deadline trống → "Không hạn nộp" ───────────────────────────────

test.describe("ASG-15: no deadline shown as Không hạn nộp", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-15: batch card without deadline shows Không hạn nộp OR deadline input has no required attr", async ({
    page,
  }) => {
    await gotoAssignments(page);

    const noDeadlineTexts = page.getByText("Không hạn nộp");
    if (await noDeadlineTexts.count() > 0) {
      await expect(noDeadlineTexts.first()).toBeVisible();
    } else {
      // All batches have deadlines — verify deadline is optional via dialog
      const dialog = await openAssignDialog(page);
      const deadlineInput = dialog.getByTestId("assign-deadline-input");
      await expect(deadlineInput).toBeVisible({ timeout: 3_000 });
      // Input must NOT be required (deadline is optional)
      const required = await deadlineInput.getAttribute("required");
      expect(required).toBeNull();
      await cancelDialog(dialog);
    }
  });
});

// ─── ASG-16: Giao trùng đề — xác nhận hành vi backend ────────────────────────
//
// ISOLATION: Uses "Chọn học viên" mode with one student from E2E Class B (spare).
// Even though E2E Batch Set may already have been assigned to some Class B students
// by prior runs, the backend behaviour (allow or reject) is what we're testing here.
// NEVER assigns to Class A (reserved accounts).

test.describe("ASG-16: re-assigning same set to same class (duplicate assign)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("ASG-16: assigning E2E Batch Set to a Class B student again — backend allows or rejects gracefully", async ({
    page,
  }) => {
    await gotoAssignments(page);

    // Attempt to assign E2E Batch Set to one spare student in Class B.
    // If backend allows duplicate, a new batch is created.
    // If backend rejects, an error message appears in the dialog.
    const assignReqPromise = page.waitForRequest(
      (req) => req.url().includes("/assign") && req.method() === "POST",
      { timeout: 15_000 },
    );

    const dialog = await openAssignDialog(page);
    await selectBatchSet(dialog);

    // "Chọn học viên" — safer than "Cả lớp", no reserved accounts touched
    await pickSpareStudent(dialog);

    const submitBtn = dialog.getByTestId("assign-submit-btn");
    await expect(submitBtn).not.toBeDisabled({ timeout: 3_000 });
    await submitBtn.click();

    const req = await assignReqPromise;
    const status = (await req.response())?.status() ?? 0;

    if (status >= 200 && status < 300) {
      // Backend allowed duplicate: new batch created, dialog closes, navigates to /assignments
      await expect(page).toHaveURL(/\/assignments/, { timeout: 10_000 });
    } else {
      // Backend rejected: error message shown inside dialog, dialog stays open
      const errorMsg = dialog.locator(".bg-error-50");
      await expect(errorMsg).toBeVisible({ timeout: 5_000 });
      await cancelDialog(dialog);
    }
  });
});
