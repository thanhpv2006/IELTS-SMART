/**
 * E2E spec: Non-functional (NF-02 responsive, NF-03 browser thiếu MediaRecorder).
 *
 * NF-02: app-shell có layout responsive (mobile drawer). Set viewport mobile →
 *        hamburger + drawer; desktop → hamburger hidden (md:hidden).
 * NF-03: mic test bọc `new MediaRecorder` trong try/catch → trình duyệt KHÔNG có
 *        MediaRecorder missing (e.g. old Safari) → report a clear mic-error, do NOT crash.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../setup/auth";

// ─────────────────────────────────────────────────────────────────────────────
// NF-02: Responsive mobile/tablet
// ─────────────────────────────────────────────────────────────────────────────

test("NF-02: mobile + tablet hiện hamburger + drawer; desktop ẩn hamburger", async ({ context, page }) => {
  await loginAs(context, "owner");

  // Mobile viewport (iPhone-ish).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  // The hamburger shows below lg; the drawer overlay is not rendered yet.
  await expect(page.getByTestId("mobile-menu-btn")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("mobile-nav-overlay")).toHaveCount(0);

  // Open the drawer → the overlay and sidebar-nav appear.
  await page.getByTestId("mobile-menu-btn").click();
  await expect(page.getByTestId("mobile-nav-overlay")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId("sidebar-nav")).toBeVisible();

  // Close via the "Đóng menu" button inside the drawer (the overlay is covered by the
  // sidebar in the middle, so it cannot be clicked directly).
  await page.getByLabel("Đóng menu").click();
  await expect(page.getByTestId("mobile-nav-overlay")).toHaveCount(0);

  // Tablet viewport (iPad portrait) → still the drawer, so the hamburger stays.
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mobile-menu-btn")).toBeVisible({ timeout: 15_000 });

  // Desktop viewport (>=lg) → the hamburger is hidden and the sidebar is static.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("sidebar-nav")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("mobile-menu-btn")).not.toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────
// NF-03: Browser thiếu MediaRecorder (Safari cũ) → báo lỗi, không crash
// ─────────────────────────────────────────────────────────────────────────────

test("NF-03: thiếu MediaRecorder → mic test báo lỗi rõ (không crash)", async ({ context, page }) => {
  await loginAs(context, "student");

  // Simulate a browser without MediaRecorder (deleted before the page JS runs).
  await page.addInitScript(() => {
    // @ts-expect-error — gỡ API để mô phỏng Safari cũ
    delete window.MediaRecorder;
  });

  await page.goto("/student/assignments");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bài tập" }),
  ).toBeVisible({ timeout: 15_000 });

  const takeLink = page.getByRole("link", { name: "Làm bài" }).first();
  await expect(takeLink).toBeVisible({ timeout: 10_000 });
  await takeLink.click();

  // Mic test: getUserMedia (fake mic) succeeds → `new MediaRecorder()` throws → caught →
  // mic-error is shown (graceful). The page does NOT crash: the retry button is still there.
  await expect(page.getByTestId("start-mic-btn")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("start-mic-btn").click();

  await expect(page.getByTestId("mic-error")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("mic-retry-btn")).toBeVisible();
});
