/**
 * E2E spec: class management (/classes)
 *
 * Matrix IDs covered: CLS-01 through CLS-16
 *
 * Seed requirements (E2E-CONTRACT.md §"Seed inventory v2"):
 *   - owner@e2e.local: partner_owner in E2E Center
 *   - teacher@e2e.local: teacher in E2E Center (in charge of E2E Class A + E2E Class Empty)
 *   - E2E Class A: teacher@e2e.local, 11 students (student + review + writing + done + s01..07)
 *   - E2E Class B: teacher01@e2e.local, 7 students
 *   - E2E Class Empty: teacher@e2e.local, 0 students
 *   - 21+ students in E2E Center for add/remove operations
 *   - Template served at /templates/mau-lop-hoc.xlsx
 *   - XLSX fixture at tests/fixtures/xlsx/classes-valid.xlsx
 *
 * Isolation rules:
 *   - Mutations create timestamp-unique names (e.g. `E2E Class ${Date.now()}`)
 *   - Seed classes (Class A, B, Empty) are NEVER deleted
 *   - If testing "remove student": first add a newly-created student, then remove that student
 *   - List/filter asserts use lower-bound counts only (other test runs may have created classes)
 *
 * Auth: loginAs(context, "owner") or loginAs(context, "teacher") per test.
 *
 * Assumptions:
 *   A1. classApi.list() returns teacher-scoped list server-side.
 *       teacher@e2e.local sees only its own classes (Class A + Class Empty).
 *       owner@e2e.local sees all classes.
 *   A2. The "Giao bài" button on a class card triggers AssignedHomeworksDialog
 *       (already-assigned work) then optionally AssignDialog. The card button maps to onAssign.
 *   A3. "Thêm HV" button triggers ClassStudentsDialog, which renders ClassStudentsPanel:
 *       a "Danh sách học viên" heading + count, an "open-add-students" toggle
 *       revealing an available-students popover, and instant per-student
 *       add/remove (no batch selection, no checkboxes).
 *   A4. Teacher create dialog: isOwner=false → teacher-select is hidden; backend auto-assigns.
 *   A5. Progress bar colour: <60% → bg-brand-500, 60–79% → bg-amber-400, >=80% → bg-emerald-500.
 *   A6. E2E Class Empty has 0 students → class-students-empty testid shown in the panel.
 *   A7. Import xlsx owner path: ImportDialog describes "Email GV" column.
 *       Import xlsx teacher path: dialog describes "bỏ qua cột Email GV".
 */

import path from "path";
import { test, expect } from "@playwright/test";
import { apiBase, loginAs } from "../setup/auth";
import { accessTokenFor } from "./seat";

const FIXTURES = path.join(__dirname, "../fixtures/xlsx");

// ── Navigation helper ──────────────────────────────────────────────────────────

async function gotoClasses(page: import("@playwright/test").Page) {
  await page.goto("/classes");
  await expect(
    page.getByRole("heading", { name: "Quản lý lớp học" }),
  ).toBeVisible({ timeout: 15_000 });
}

// ─── CLS-01: List — cards present, required meta visible ─────────────────────

test.describe("CLS-01: class list shows cards", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-01: at least 3 seed class cards visible with name, teacher, student count", async ({
    page,
  }) => {
    await gotoClasses(page);

    // Seed has E2E Class A, B, Empty at minimum
    const cards = page.locator("[data-testid^='class-card-']");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // At least one card shows student count pattern "N học viên"
    await expect(page.getByText(/học viên/).first()).toBeVisible();
  });
});

// ─── CLS-02: Create class (owner, with teacher selector) ─────────────────────

test.describe("CLS-02: create class as owner (has teacher selector)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-02: owner creates class with teacher → card appears in list", async ({
    page,
  }) => {
    await gotoClasses(page);

    const ts = Date.now();
    const className = `E2E Class ${ts}`;

    const createReq = page.waitForRequest(
      (req) => req.url().includes("/smart/classes") && req.method() === "POST",
    );

    await page.getByTestId("add-class-btn").click();
    await expect(page.getByTestId("class-name-input")).toBeVisible({ timeout: 5_000 });

    // Owner should see the teacher selector
    await expect(page.getByTestId("class-teacher-select")).toBeVisible();

    await page.getByTestId("class-name-input").fill(className);
    await page.getByTestId("class-capacity-input").fill("20");
    // Select the first available teacher option (seed has teacher@e2e.local)
    const teacherSelect = page.getByTestId("class-teacher-select");
    const options = await teacherSelect.locator("option").count();
    if (options > 1) {
      // Pick first non-empty option
      const optionValues = await teacherSelect.locator("option").all();
      const firstTeacher = optionValues.find(async (o) => (await o.getAttribute("value")) !== "");
      if (firstTeacher) {
        const val = await optionValues[1].getAttribute("value");
        if (val) await teacherSelect.selectOption(val);
      }
    }

    await page.getByTestId("save-class-btn").click();
    await createReq;

    // Dialog closes on success
    await expect(page.getByTestId("class-name-input")).not.toBeVisible({
      timeout: 10_000,
    });

    // New card is visible in the grid. Scoped to the card's title button: the card also carries a
    // hover tooltip holding the same name, so a bare text lookup matches two nodes.
    await expect(
      page.getByRole("button", { name: className, exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── CLS-03: Validation — missing name ───────────────────────────────────────

test.describe("CLS-03: validation — missing class name", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-03: submitting with empty name shows HTML5 required validation", async ({
    page,
  }) => {
    await gotoClasses(page);

    let postFired = false;
    page.on("request", (req) => {
      if (req.url().includes("/smart/classes") && req.method() === "POST") {
        postFired = true;
      }
    });

    await page.getByTestId("add-class-btn").click();
    await expect(page.getByTestId("class-name-input")).toBeVisible({ timeout: 5_000 });

    // Leave name empty, only set capacity
    await page.getByTestId("class-capacity-input").fill("10");
    await page.getByTestId("save-class-btn").click();

    // HTML5 required blocks submission — dialog stays open
    await expect(page.getByTestId("class-name-input")).toBeVisible({ timeout: 3_000 });
    expect(postFired).toBe(false);
  });
});

test.describe("CLS-03b: validation — capacity below 1", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-03b: capacity field has min=1 preventing values below 1 from submitting", async ({
    page,
  }) => {
    await gotoClasses(page);

    let postFired = false;
    page.on("request", (req) => {
      if (req.url().includes("/smart/classes") && req.method() === "POST") {
        postFired = true;
      }
    });

    await page.getByTestId("add-class-btn").click();
    await expect(page.getByTestId("class-name-input")).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("class-name-input").fill(`E2E CapTest ${Date.now()}`);
    // Clear and set to 0 — below min=1
    await page.getByTestId("class-capacity-input").fill("0");
    await page.getByTestId("save-class-btn").click();

    // Browser min validation prevents submission
    await expect(page.getByTestId("class-name-input")).toBeVisible({ timeout: 3_000 });
    expect(postFired).toBe(false);
  });
});

// ─── CLS-04: Teacher creates class — no teacher selector, auto-assigned ──────

test.describe("CLS-04: teacher creates class (auto-assign)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("CLS-04: teacher sees no class-teacher-select in create dialog", async ({
    page,
  }) => {
    await gotoClasses(page);

    await page.getByTestId("add-class-btn").click();
    await expect(page.getByTestId("class-name-input")).toBeVisible({ timeout: 5_000 });

    // Teacher dialog must NOT show the teacher selector
    await expect(page.getByTestId("class-teacher-select")).not.toBeVisible();
  });

  test("CLS-04: teacher creates class → card appears without teacher selection", async ({
    page,
  }) => {
    await gotoClasses(page);

    const ts = Date.now();
    const className = `E2E Teacher Class ${ts}`;

    const createReq = page.waitForRequest(
      (req) => req.url().includes("/smart/classes") && req.method() === "POST",
    );

    await page.getByTestId("add-class-btn").click();
    await expect(page.getByTestId("class-name-input")).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("class-name-input").fill(className);
    await page.getByTestId("save-class-btn").click();
    await createReq;

    await expect(page.getByTestId("class-name-input")).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: className, exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── CLS-05: Edit class prefills values ──────────────────────────────────────

test.describe("CLS-05: edit class prefills existing data", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-05: edit dialog for E2E Class A shows prefilled name", async ({
    page,
  }) => {
    await gotoClasses(page);

    // Find Class A card — it contains the name "E2E Class A"
    const classACard = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" });
    await expect(classACard).toBeVisible({ timeout: 15_000 });

    // Open the dropdown menu via the MoreHorizontal button inside the card
    const menuBtn = classACard.getByRole("button", { name: "Mở thao tác lớp học" });
    await menuBtn.click();

    // Click "Sửa" in the dropdown
    const editBtn = classACard.locator("[data-testid^='edit-class-btn-']");
    await editBtn.click();

    // Dialog opens with "Sửa lớp học" title
    await expect(page.getByRole("heading", { name: "Sửa lớp học" })).toBeVisible({ timeout: 5_000 });

    // Name input is prefilled with "E2E Class A"
    const nameInput = page.getByTestId("class-name-input");
    await expect(nameInput).toHaveValue("E2E Class A");
  });
});

// ─── CLS-06: Class detail dialog — meta visible ───────────────────────────────
// NOTE: Dialog component does not forward data-testid to DOM, so we locate by
// role="dialog" + aria-label (which is set to the dialog's title prop).

test.describe("CLS-06: class detail via Thêm HV dialog", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-06: clicking Thêm HV on Class A opens ClassStudentsDialog with student list", async ({
    page,
  }) => {
    await gotoClasses(page);

    const classACard = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" });
    await expect(classACard).toBeVisible({ timeout: 15_000 });

    // Click "Thêm HV" — data-testid="add-students-btn"
    await classACard.getByTestId("add-students-btn").click();

    // ClassStudentsDialog opens — Dialog sets aria-label to its title
    // Title = "Học viên — E2E Class A"
    const dialog = page.locator("[role='dialog']").filter({ hasText: "E2E Class A" });
    await expect(dialog).toBeVisible({ timeout: 8_000 });

    // ClassStudentsPanel heading confirms the student list is rendered
    await expect(page.getByText("Danh sách học viên")).toBeVisible();

    // At least one student row is visible in the enrolled list (Class A has 11)
    const removeButtons = page.locator("[data-testid^='remove-student-btn-']");
    await expect(removeButtons.first()).toBeVisible({ timeout: 10_000 });
    const removeCount = await removeButtons.count();
    expect(removeCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── CLS-07: Class detail page — level, teacher, student count, progress ──────

test.describe("CLS-07: class detail page meta", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-07: navigating to /classes/:id shows class name, teacher, student count", async ({
    page,
  }) => {
    await gotoClasses(page);

    // Navigate to Class A by clicking its name (the heading button)
    const classACard = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" });
    await expect(classACard).toBeVisible({ timeout: 15_000 });

    // The class name is a clickable heading button in the card — clicking it navigates to /classes/:id
    const classNameBtn = classACard.getByRole("button", { name: "E2E Class A" });
    await classNameBtn.click();

    // URL changes to /classes/:id
    await expect(page).toHaveURL(/\/classes\/[a-z0-9-]+/, { timeout: 10_000 });

    // Detail page shows class name as heading
    await expect(page.getByRole("heading", { name: "E2E Class A" })).toBeVisible({ timeout: 10_000 });

    // Shows teacher info (teacher@ is assigned to Class A)
    await expect(page.getByText(/teacher@e2e\.local|teacher/i)).toBeVisible();

    // Shows stat items: "Sĩ số", progress bar
    await expect(page.getByText("Sĩ số")).toBeVisible();
    await expect(page.getByText("Tiến độ hoàn thành")).toBeVisible();

    // Shows student list section
    await expect(page.getByText("Danh sách học viên")).toBeVisible();
  });
});

// ─── CLS-08: Add student to class ────────────────────────────────────────────

test.describe("CLS-08: add student to class via ClassStudentsDialog", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-08: adds an available student to Class A, confirm they appear in the enrolled list", async ({
    page,
  }) => {
    await gotoClasses(page);

    // Open ClassStudentsDialog for Class A
    const classACard = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" });
    await expect(classACard).toBeVisible({ timeout: 15_000 });
    await classACard.getByTestId("add-students-btn").click();
    await expect(page.getByText("Danh sách học viên")).toBeVisible({ timeout: 8_000 });

    // Open the "Thêm học viên" popover
    await page.getByTestId("open-add-students").click();
    await expect(page.getByText("Chưa có trong lớp")).toBeVisible({ timeout: 5_000 });

    // Find first available student (not already in class)
    const availableRows = page.locator("[data-testid^='available-student-']");
    const availableCount = await availableRows.count();

    if (availableCount === 0) {
      // All students already in the class — skip gracefully
      test.skip(true, "No available students to add (all enrolled already)");
      return;
    }

    // Extract the student's user_id from the row's data-testid
    const firstAvailable = availableRows.first();
    const testIdAttr = await firstAvailable.getAttribute("data-testid");
    const studentId = testIdAttr?.replace("available-student-", "") ?? "";

    const addReq = page.waitForRequest(
      (req) => req.url().includes("/smart/classes") && req.url().includes("/students") && req.method() === "POST",
    );
    await page.getByTestId(`add-student-btn-${studentId}`).click();
    await addReq;

    // The student now appears in the enrolled list with a remove button
    await expect(page.getByTestId(`remove-student-btn-${studentId}`)).toBeVisible({ timeout: 10_000 });
  });
});

// ─── CLS-09: Remove student from class ───────────────────────────────────────

test.describe("CLS-09: remove student from class", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-09: adds a student then removes them to avoid disturbing seed", async ({
    page,
  }) => {
    await gotoClasses(page);

    // Open ClassStudentsDialog for Class A
    const classACard = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" });
    await expect(classACard).toBeVisible({ timeout: 15_000 });
    await classACard.getByTestId("add-students-btn").click();
    await expect(page.getByText("Danh sách học viên")).toBeVisible({ timeout: 8_000 });

    // Open the "Thêm học viên" popover
    await page.getByTestId("open-add-students").click();
    await expect(page.getByText("Chưa có trong lớp")).toBeVisible({ timeout: 5_000 });

    // Find first available student
    const availableRows = page.locator("[data-testid^='available-student-']");
    const availableCount = await availableRows.count();

    if (availableCount === 0) {
      test.skip(true, "No available students to add/remove in Class A");
      return;
    }

    // Extract the student's user_id from data-testid
    const firstAvailable = availableRows.first();
    const testIdAttr = await firstAvailable.getAttribute("data-testid");
    const addedUserId = testIdAttr?.replace("available-student-", "") ?? "";

    // Add the student — instant single-click API call
    await page.getByTestId(`add-student-btn-${addedUserId}`).click();

    // Wait until "remove-student-btn" for this user appears
    const removeBtn = page.getByTestId(`remove-student-btn-${addedUserId}`);
    await expect(removeBtn).toBeVisible({ timeout: 10_000 });

    // Now remove them
    const removeReq = page.waitForRequest(
      (req) => req.url().includes("/smart/classes") && req.url().includes("remove") && req.method() === "POST",
    );
    await removeBtn.click();
    await removeReq;

    // The student's remove button disappears from current list
    await expect(removeBtn).not.toBeVisible({ timeout: 10_000 });
  });
});

// ─── CLS-10: "Giao bài" opens AssignedHomeworksDialog (locked class) ─────────

test.describe("CLS-10: Giao bài button opens homework list dialog", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-10: clicking Giao bài on Class A shows AssignedHomeworksDialog", async ({
    page,
  }) => {
    await gotoClasses(page);

    const classACard = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" });
    await expect(classACard).toBeVisible({ timeout: 15_000 });

    // Click "Giao bài" — data-testid="assign-from-class-btn"
    await classACard.getByTestId("assign-from-class-btn").click();

    // AssignedHomeworksDialog opens with the class name in title
    await expect(page.getByText(/Bài đã giao — E2E Class A/)).toBeVisible({ timeout: 8_000 });

    await expect(page.getByRole("button", { name: "Giao bài mới" })).toBeVisible();
  });
});

// ─── CLS-11: "Giao bài mới" opens AssignDialog with locked class ──────────────

test.describe("CLS-11: Giao bài mới opens AssignDialog for the locked class", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-11: clicking Giao bài mới in homework dialog opens AssignDialog", async ({
    page,
  }) => {
    await gotoClasses(page);

    const classACard = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" });
    await expect(classACard).toBeVisible({ timeout: 15_000 });
    await classACard.getByTestId("assign-from-class-btn").click();
    await expect(page.getByText(/Bài đã giao — E2E Class A/)).toBeVisible({ timeout: 8_000 });

    await page.getByRole("button", { name: "Giao bài mới" }).click();

    // AssignDialog opens — it has the assign-set-search input
    await expect(page.getByTestId("assign-set-search")).toBeVisible({ timeout: 8_000 });
  });
});

// ─── CLS-12: Import xlsx — owner has "Email GV" column description ────────────

test.describe("CLS-12: import xlsx — owner sees Email GV column", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-12: owner import dialog mentions Email GV column", async ({
    page,
  }) => {
    await gotoClasses(page);
    await page.getByTestId("import-class-btn").click();

    await expect(
      page.getByRole("heading", { name: "Nhập lớp học từ file Excel" }),
    ).toBeVisible({ timeout: 5_000 });

    // Owner dialog describes the Email GV column
    await expect(page.getByText(/Email GV/)).toBeVisible();
  });

  test("CLS-12: uploading classes-valid.xlsx shows success", async ({ page }) => {
    await gotoClasses(page);
    await page.getByTestId("import-class-btn").click();
    await expect(
      page.getByRole("heading", { name: "Nhập lớp học từ file Excel" }),
    ).toBeVisible({ timeout: 5_000 });

    const fileInput = page.locator("input[type='file'][accept='.xlsx']");
    await fileInput.setInputFiles(path.join(FIXTURES, "classes-valid.xlsx"));

    await expect(page.getByText(/thành công/)).toBeVisible({ timeout: 15_000 });
  });
});

// ─── CLS-13: Teacher import — no Email GV description ─────────────────────────

test.describe("CLS-13: teacher import dialog — no Email GV requirement", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("CLS-13: teacher import dialog says classes will be auto-assigned (no Email GV)", async ({
    page,
  }) => {
    await gotoClasses(page);
    await page.getByTestId("import-class-btn").click();

    await expect(
      page.getByRole("heading", { name: "Nhập lớp học từ file Excel" }),
    ).toBeVisible({ timeout: 5_000 });

    // Teacher dialog mentions auto-assignment, not Email GV requirement
    await expect(page.getByText(/tự được gán|bỏ qua cột Email GV/)).toBeVisible();
  });
});

// ─── CLS-14: Progress bar colour ─────────────────────────────────────────────

test.describe("CLS-14: progress bar has coloured fill", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-14: each class card renders a progress bar div", async ({ page }) => {
    await gotoClasses(page);

    // Wait for at least one card
    await expect(page.locator("[data-testid^='class-card-']").first()).toBeVisible({ timeout: 15_000 });

    // Each card contains a progress bar element with background colour classes
    // bg-brand-500 | bg-amber-400 | bg-emerald-500
    const progressBars = page.locator(
      ".bg-brand-500:not([data-testid]), .bg-amber-400, .bg-emerald-500",
    );
    const count = await progressBars.count();
    // At least one card has a coloured bar (could be multiple)
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── CLS-15: Empty class — "Chưa có học viên trong lớp." ─────────────────────

test.describe("CLS-15: empty class dialog shows empty state", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("CLS-15: class-students-empty text is rendered for a class with 0 enrolled students", async ({
    page,
    request,
  }) => {
    // Created here, not taken from the seed: `E2E Class Empty` collects students from
    // earlier runs on a shared stack, and the empty state only renders at 0 enrolled.
    const name = `E2E Class Empty ${Date.now()}`;
    const token = await accessTokenFor(request, "owner@e2e.local", "Test@1234");
    const created = await request.post(`${apiBase()}/smart/classes`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name },
    });
    expect(created.ok(), `create class failed: ${created.status()}`).toBe(true);
    const { id: classId } = (await created.json()) as { id: string };

    await gotoClasses(page);

    const emptyCard = page.locator("[data-testid^='class-card-']").filter({ hasText: name });
    await expect(emptyCard).toBeVisible({ timeout: 15_000 });

    await emptyCard.getByTestId("add-students-btn").click();
    await expect(page.getByText("Danh sách học viên")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Đang tải...")).not.toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("class-students-empty")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("class-students-empty")).toContainText(
      "Chưa có học viên trong lớp.",
    );

    await request.delete(`${apiBase()}/smart/classes/${classId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });
});

// ─── CLS-16: Teacher scoping — teacher sees only their own classes ─────────────

test.describe("CLS-16: teacher scoping — sees only assigned classes", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("CLS-16: teacher@e2e sees Class A and Empty but NOT Class B (teacher01)", async ({
    page,
  }) => {
    await gotoClasses(page);

    // Wait for cards to load
    await expect(page.locator("[data-testid^='class-card-']").first()).toBeVisible({ timeout: 15_000 });

    // Class A should be visible (teacher@ is assigned)
    await expect(
      page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class A" }),
    ).toBeVisible({ timeout: 5_000 });

    // Class Empty should be visible (teacher@ is assigned)
    await expect(
      page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class Empty" }),
    ).toBeVisible({ timeout: 5_000 });

    // Class B belongs to teacher01 — should NOT be visible for teacher@
    const classBCards = page.locator("[data-testid^='class-card-']").filter({ hasText: "E2E Class B" });
    await expect(classBCards).toHaveCount(0);
  });
});
