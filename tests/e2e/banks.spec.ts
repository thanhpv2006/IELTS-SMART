/**
 * E2E spec: question bank (/banks) — 3-kind taxonomy {homework, exam, full_test}.
 *
 * Rewritten for the catalog-3-kind-web change: the three old surfaces
 * (/banks tier×skill, /question-bank, /mock) are consolidated into one
 * "Ngân hàng đề". Authoring is question-first (author a question inside the
 * set editor → publish → attach). full_test is one set with 4 skill tabs.
 *
 * Selectors (from the new UI):
 *   List  (banks/page.tsx):      create-set-btn, filter-kind, filter-skill,
 *                                filter-status, bank-card-{id}
 *   Create (create-set-dialog):  create-set-kind-{practice|full_test},
 *                                create-set-skill, create-set-title, create-set-save
 *   Editor (banks/[id]/page.tsx): heading = title, kind/skill/status badges,
 *                                "Thêm câu hỏi", "Xuất bản", full_test tabs
 *   Question editor:             question-editor-save + contenteditable prompt
 *   Lifecycle (list):            bank-select-{id}, bank-select-page, bank-card-menu-{id},
 *                                bank-archive-btn-{id}, bank-restore-btn-{id},
 *                                bank-delete-btn-{id}, set-bulk-bar, set-bulk-archive,
 *                                set-bulk-restore, set-bulk-delete, set-delete-confirm,
 *                                set-lifecycle-message
 *   Lifecycle (editor):          set-archive-btn, set-restore-btn, set-delete-btn
 *
 * Seed (E2E-CONTRACT, post-cap-fix): owner@e2e.local, "E2E Speaking Set"
 * (speaking/homework, 5 items).
 *
 * Isolation: created sets use timestamp-unique names; seed sets never mutated.
 */

import path from "path";
import { test, expect, type Page } from "@playwright/test";
import { loginAs } from "../setup/auth";

async function gotoBanks(page: Page) {
  await page.goto("/banks");
  await expect(page.getByRole("heading", { name: "Ngân hàng đề" })).toBeVisible({ timeout: 15_000 });
}

/** The list is newest-first and paged, so the seed sets sink past page 1 as runs add sets. */
async function pageUntilCardVisible(page: Page, title: string) {
  const card = page.locator("[data-testid^='bank-card-']").filter({ hasText: title }).first();
  const firstCard = page.locator("[data-testid^='bank-card-']").first();
  const next = page.getByTestId("page-next");
  while (!(await card.isVisible())) {
    if (!(await next.isVisible()) || (await next.isDisabled())) break;
    const shownBefore = (await firstCard.getAttribute("data-testid")) ?? "";
    await next.click();
    await expect(firstCard).not.toHaveAttribute("data-testid", shownBefore, { timeout: 10_000 });
  }
  await expect(card).toBeVisible();
}

/** Open the create dialog, pick a kind (+ skill for non-full_test), name it, submit.
 *  Returns once the app has navigated to the new set's editor page. */
async function createSet(
  page: Page,
  kind: "practice" | "full_test",
  title: string,
  skill?: "speaking" | "writing" | "reading" | "listening",
) {
  await page.getByTestId("create-set-btn").click();
  await expect(page.getByRole("heading", { name: "Tạo đề mới" })).toBeVisible({ timeout: 5_000 });
  await page.getByTestId(`create-set-kind-${kind}`).click();
  if (kind !== "full_test" && skill) {
    await page.getByTestId("create-set-skill").selectOption(skill);
  }
  await page.getByTestId("create-set-title").fill(title);
  await page.getByTestId("create-set-save").click();
  // onCreated → router.push(`/banks/{id}`)
  await expect(page).toHaveURL(/\/banks\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 10_000 });
}

// ─── NAV: single "Ngân hàng đề" entry ────────────────────────────────────────

test.describe("BNK-nav: consolidated navigation", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("sidebar has one 'Ngân hàng đề' entry, no 'Ngân hàng câu hỏi' / 'Đề Mock'", async ({ page }) => {
    await gotoBanks(page);
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Ngân hàng đề" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Ngân hàng câu hỏi" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Đề Mock" })).toHaveCount(0);
  });

  test("old routes are gone (404 / no content)", async ({ page }) => {
    await page.goto("/question-bank");
    await expect(page.getByRole("heading", { name: "Ngân hàng câu hỏi" })).toHaveCount(0);
    await page.goto("/mock");
    await expect(page.getByRole("heading", { name: "Đề Mock" })).toHaveCount(0);
  });
});

// ─── LIST: seed set + kind filter ────────────────────────────────────────────

test.describe("BNK-list: bank list + filters", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("seed 'E2E Speaking Set' card is visible under 'Của tôi'", async ({ page }) => {
    await gotoBanks(page);
    await expect(page.locator("[data-testid^='bank-card-']").first()).toBeVisible({ timeout: 15_000 });
    await pageUntilCardVisible(page, "E2E Speaking Set");
    // Redesigned card affordances: Chi tiết button + "Mã <code>" line + "lượt giao" count.
    await expect(page.getByRole("button", { name: "Chi tiết" }).first()).toBeVisible();
    await expect(page.getByText(/Mã /).first()).toBeVisible();
    await expect(page.getByText(/lượt giao/).first()).toBeVisible();
  });

  // FULL_TEST_ENABLED is on, so full_test is one of the kinds a centre can filter by.
  test("full_test is a kind filter option", async ({ page }) => {
    await gotoBanks(page);
    await expect(page.getByTestId("filter-skill")).toBeVisible();
    await expect(page.locator('[data-testid="filter-kind"] option[value="full_test"]')).toHaveCount(1);
  });
});

// ─── CREATE: kind-first, skill only for non-full_test ────────────────────────

test.describe("BNK-create: create sets per kind", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("create practice/speaking → editor shows Luyện tập + Speaking badges", async ({ page }) => {
    await gotoBanks(page);
    await createSet(page, "practice", `E2E HW SP ${Date.now()}`, "speaking");
    await expect(page.getByText("Luyện tập").first()).toBeVisible();
    await expect(page.getByText("Speaking", { exact: false }).first()).toBeVisible();
  });

  // FULL_TEST_ENABLED is on, so practice and full_test are offered.
  test("every set kind is offered in the create dialog", async ({ page }) => {
    await gotoBanks(page);
    await page.getByTestId("create-set-btn").click();
    await expect(page.getByRole("heading", { name: "Tạo đề mới" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("create-set-kind-practice")).toBeVisible();
    await expect(page.getByTestId("create-set-kind-full_test")).toBeVisible();
    await expect(page.getByTestId("create-set-kind-homework")).toHaveCount(0);
    await expect(page.getByTestId("create-set-kind-exam")).toHaveCount(0);
  });
});

// ─── AUTHOR: question-first add + publish ────────────────────────────────────

test.describe("BNK-author: question-first authoring", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("add a speaking question to a practice set, then publish", async ({ page }) => {
    await gotoBanks(page);
    const title = `E2E Author ${Date.now()}`;
    await createSet(page, "practice", title, "speaking");

    // Starts as draft
    await expect(page.getByText("Nháp").first()).toBeVisible();

    // "Thêm câu hỏi" → QuestionEditor (skill locked to speaking)
    await page.getByRole("button", { name: "Thêm câu hỏi" }).click();
    await expect(page.getByRole("heading", { name: "Tạo câu hỏi" })).toBeVisible({ timeout: 5_000 });

    const prompt = `E2E speaking prompt ${Date.now()}`;
    const editor = page.locator("[role='dialog'] [contenteditable='true']").first();
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.fill(prompt);

    // Save → create question → publish → attach (question-first)
    await page.getByTestId("question-editor-save").click();
    await expect(page.getByRole("heading", { name: "Tạo câu hỏi" })).not.toBeVisible({ timeout: 10_000 });

    // The new question row appears in the panel (preview of its prompt)
    await expect(page.getByText(prompt, { exact: false })).toBeVisible({ timeout: 10_000 });

    // Publish the set → status flips to "Đã xuất bản"
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(page.getByText("Đã xuất bản").first()).toBeVisible({ timeout: 10_000 });
  });

  test("the set fixes its Part: the selector locks and the cap follows that Part", async ({
    page,
  }) => {
    await gotoBanks(page);
    await createSet(page, "practice", `E2E OnePart ${Date.now()}`, "speaking");

    const partSelect = page.getByTestId("question-editor-part");

    // An empty set has no Part yet, so every Part is still on offer — pick the cue-card one.
    await page.getByRole("button", { name: "Thêm câu hỏi" }).click();
    await expect(page.getByRole("heading", { name: "Tạo câu hỏi" })).toBeVisible({ timeout: 5_000 });
    await expect(partSelect).toBeEnabled();
    await partSelect.selectOption("2");
    const prompt = `E2E part2 prompt ${Date.now()}`;
    const editor = page.locator("[role='dialog'] [contenteditable='true']").first();
    await expect(editor).toBeVisible({ timeout: 5_000 });
    await editor.fill(prompt);
    await page.getByTestId("question-editor-save").click();
    await expect(page.getByRole("heading", { name: "Tạo câu hỏi" })).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(prompt, { exact: false })).toBeVisible({ timeout: 10_000 });

    // Speaking caps at 5 in general but at 1 on Part 2, and the counter must say so.
    await expect(page.getByText(/^1\/1 câu$/)).toBeVisible({ timeout: 10_000 });

    // The first question fixed the Part, so the next one cannot be authored on another.
    await page.getByRole("button", { name: "Thêm câu hỏi" }).click();
    await expect(page.getByRole("heading", { name: "Tạo câu hỏi" })).toBeVisible({ timeout: 5_000 });
    await expect(partSelect).toBeDisabled();
    await expect(partSelect).toHaveValue("2");
    await expect(page.getByText(/Bộ đề này thuộc Part 2/)).toBeVisible();
    await page.getByRole("button", { name: "Huỷ" }).click().catch(() => {});

    // The Part is what defines the set now, so the header states it and each row repeats it.
    await expect(page.getByText("Part 2", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── IMPORT: Excel (R/L) ──────────────────────────────────────────────────────

test.describe("BNK-import: Import Excel skill picker", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("picker → Reading uploads R/L template and shows success", async ({ page }) => {
    await gotoBanks(page);
    await page.getByTestId("import-btn").click();
    await page.getByTestId("import-excel-btn").click();
    await expect(page.getByRole("heading", { name: "Import Excel" })).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("import-skill-reading").click();
    await expect(page.getByRole("heading", { name: "Import đề Reading" })).toBeVisible({ timeout: 5_000 });
    const fileInput = page.locator("input[type='file'][accept='.xlsx']");
    await fileInput.setInputFiles(path.join(__dirname, "../../public/templates/reading-mau.xlsx"));
    await expect(page.getByText(/thành công/)).toBeVisible({ timeout: 20_000 });
  });

  test("picker → Writing uploads S/W template and shows success", async ({ page }) => {
    await gotoBanks(page);
    await page.getByTestId("import-btn").click();
    await page.getByTestId("import-excel-btn").click();
    await expect(page.getByRole("heading", { name: "Import Excel" })).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("import-skill-writing").click();
    await expect(page.getByRole("heading", { name: "Import đề Writing" })).toBeVisible({ timeout: 5_000 });
    const fileInput = page.locator("input[type='file'][accept='.xlsx']");
    await fileInput.setInputFiles(path.join(__dirname, "../../public/templates/writing-mau.xlsx"));
    await expect(page.getByText(/thành công/)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("BNK-lifecycle: archive / restore / delete", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  const cardFor = (page: Page, title: string) =>
    page.locator("[data-testid^='bank-card-']").filter({ hasText: title });

  test("card menu archives a set, the archived filter restores it", async ({ page }) => {
    const title = `E2E Archive ${Date.now()}`;
    await gotoBanks(page);
    await createSet(page, "practice", title, "speaking");
    await gotoBanks(page);

    await cardFor(page, title).locator("[data-testid^='bank-card-menu-']").click();
    await cardFor(page, title).locator("[data-testid^='bank-archive-btn-']").click();
    await expect(page.getByTestId("set-lifecycle-message")).toHaveText("Đã lưu trữ 1 đề.");
    await expect(cardFor(page, title)).toHaveCount(0);

    await page.getByTestId("filter-status").selectOption("archived");
    await expect(cardFor(page, title)).toBeVisible({ timeout: 10_000 });
    await expect(cardFor(page, title).getByText("Đã lưu trữ")).toBeVisible();

    await cardFor(page, title).locator("[data-testid^='bank-card-menu-']").click();
    await cardFor(page, title).locator("[data-testid^='bank-restore-btn-']").click();
    await expect(page.getByTestId("set-lifecycle-message")).toHaveText("Đã khôi phục 1 đề.");
    await expect(cardFor(page, title)).toHaveCount(0);

    await page.getByTestId("filter-status").selectOption("");
    await expect(cardFor(page, title)).toBeVisible({ timeout: 10_000 });
  });

  test("set page deletes a set after confirmation", async ({ page }) => {
    const title = `E2E Delete ${Date.now()}`;
    await gotoBanks(page);
    await createSet(page, "practice", title, "speaking");

    await page.getByTestId("set-delete-btn").click();
    await page.getByTestId("set-delete-confirm").click();
    await expect(page).toHaveURL(/\/banks$/, { timeout: 15_000 });

    await expect(page.locator("[data-testid^='bank-card-']").first()).toBeVisible({ timeout: 15_000 });
    await expect(cardFor(page, title)).toHaveCount(0);
    await page.getByTestId("filter-status").selectOption("archived");
    await expect(cardFor(page, title)).toHaveCount(0);
  });

  test("bulk bar archives then deletes two sets", async ({ page }) => {
    const stamp = Date.now();
    const titles = [`E2E Bulk A ${stamp}`, `E2E Bulk B ${stamp}`];
    await gotoBanks(page);
    for (const title of titles) {
      await createSet(page, "practice", title, "speaking");
      await gotoBanks(page);
    }

    for (const title of titles) {
      await cardFor(page, title).locator("[data-testid^='bank-select-']").check();
    }
    await expect(page.getByTestId("set-bulk-bar")).toContainText("Đã chọn 2 đề");
    await page.getByTestId("set-bulk-archive").click();
    await expect(page.getByTestId("set-lifecycle-message")).toHaveText("Đã lưu trữ 2 đề.");

    await page.getByTestId("filter-status").selectOption("archived");
    for (const title of titles) {
      await expect(cardFor(page, title)).toBeVisible({ timeout: 10_000 });
      await cardFor(page, title).locator("[data-testid^='bank-select-']").check();
    }
    await page.getByTestId("set-bulk-delete").click();
    await page.getByTestId("set-delete-confirm").click();
    await expect(page.getByTestId("set-lifecycle-message")).toHaveText("Đã xoá 2 đề.");
    for (const title of titles) {
      await expect(cardFor(page, title)).toHaveCount(0);
    }
  });
});
