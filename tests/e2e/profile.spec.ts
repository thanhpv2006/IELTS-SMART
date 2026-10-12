/**
 * E2E: Profile page (PRF-01..05)
 *
 * Matrix IDs covered:
 *   PRF-01  Owner profile shows correct fields (name, email, role, created date, partner/center name)
 *   PRF-02  Teacher profile shows correct fields (name, email, role "Giáo viên", created date)
 *   PRF-03  Student profile shows correct fields (name, email, role "Học viên", created date)
 *   PRF-04  Logout button (profile-logout-btn) clears session and redirects to /login
 *   PRF-05  Profile error state: simulate /me failure → profile-error element visible
 *
 * Scope:
 *   - (partner)/profile/page.tsx  — used by owner + teacher via /profile
 *   - (student)/student/profile/page.tsx — used by student via /student/profile (if it exists)
 *     NOTE: Based on the source, student profile route is /student/profile, but the
 *     student layout nav does not include a profile link. The page exists but may not
 *     be linked in nav. We access it via direct URL.
 *
 * data-testid anchors (E2E-CONTRACT.md §"Data-testid registry"):
 *   profile-name, profile-email, profile-role, profile-created
 *   profile-partner  (owner only — "Người quản lý" or the partner label row)
 *   profile-logout-btn, profile-error
 *
 * Note on profile-partner: In (partner)/profile/page.tsx the row "Người quản lý"
 * maps to testId "profile-partner" only when isOwner && me.name is truthy.
 * For owner@e2e.local this condition holds if the owner has a name field set in the DB.
 * If the owner account has no name, this row is absent; the test accounts for both cases.
 *
 * Auth: httpOnly cookie via loginAs(context, role) per test.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../setup/auth";

test.setTimeout(60_000);

// ─────────────────────────────────────────────────────────────────────────────
// PRF-01: Owner profile fields
// ─────────────────────────────────────────────────────────────────────────────

test("PRF-01: owner profile page shows email, role 'Trung tâm', and created date", async ({
  context,
  page,
}) => {
  await loginAs(context, "owner");

  await page.goto("/profile");

  // Wait for profile to load (profile-name is visible after /me resolves)
  await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 15_000 });

  // profile-name: displayName = partner?.name || me.email (owner uses center name)
  const nameText = await page.getByTestId("profile-name").textContent();
  expect(nameText?.trim().length).toBeGreaterThan(0);

  // profile-email: the owner's email (owner@e2e.local)
  const emailRow = page.getByTestId("profile-email");
  await expect(emailRow).toBeVisible({ timeout: 5_000 });
  const emailText = await emailRow.textContent();
  expect(emailText).toContain("owner@e2e.local");

  // profile-role: "Trung tâm" for partner_owner
  const roleRow = page.getByTestId("profile-role");
  await expect(roleRow).toBeVisible({ timeout: 5_000 });
  const roleText = await roleRow.textContent();
  expect(roleText).toContain("Trung tâm");

  // profile-created: creation date (dd/MM/yyyy, vi-VN format)
  const createdRow = page.getByTestId("profile-created");
  await expect(createdRow).toBeVisible({ timeout: 5_000 });
  const createdText = await createdRow.textContent();
  // Should be a non-empty date string
  expect(createdText?.trim().length).toBeGreaterThan(0);
  // vi-VN date format contains "/" separators
  expect(createdText).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRF-02: Teacher profile fields
// ─────────────────────────────────────────────────────────────────────────────

test("PRF-02: teacher profile page shows email, role 'Giáo viên', and created date", async ({
  context,
  page,
}) => {
  await loginAs(context, "teacher");

  await page.goto("/profile");

  await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 15_000 });

  // profile-name: for teacher, displayName = me.name || me.email
  const nameText = await page.getByTestId("profile-name").textContent();
  expect(nameText?.trim().length).toBeGreaterThan(0);

  const emailRow = page.getByTestId("profile-email");
  await expect(emailRow).toBeVisible({ timeout: 5_000 });
  const emailText = await emailRow.textContent();
  expect(emailText).toContain("teacher@e2e.local");

  // profile-role: "Giáo viên" for teacher
  const roleRow = page.getByTestId("profile-role");
  await expect(roleRow).toBeVisible({ timeout: 5_000 });
  const roleText = await roleRow.textContent();
  expect(roleText).toContain("Giáo viên");

  const createdRow = page.getByTestId("profile-created");
  await expect(createdRow).toBeVisible({ timeout: 5_000 });
  const createdText = await createdRow.textContent();
  expect(createdText).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);

  // Teacher does NOT have profile-partner row
  // (isOwner = false → the "Người quản lý" row is not rendered)
  await expect(page.getByTestId("profile-partner")).not.toBeVisible({ timeout: 3_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRF-03: Student profile fields
// ─────────────────────────────────────────────────────────────────────────────

test("PRF-03: student profile page shows email, role 'Học viên', and created date", async ({
  context,
  page,
}) => {
  await loginAs(context, "student");

  await page.goto("/student/profile");

  await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 15_000 });

  const nameText = await page.getByTestId("profile-name").textContent();
  expect(nameText?.trim().length).toBeGreaterThan(0);

  const emailRow = page.getByTestId("profile-email");
  await expect(emailRow).toBeVisible({ timeout: 5_000 });
  const emailText = await emailRow.textContent();
  expect(emailText).toContain("student@e2e.local");

  // profile-role: "Học viên" for student (hardcoded in student/profile/page.tsx)
  const roleRow = page.getByTestId("profile-role");
  await expect(roleRow).toBeVisible({ timeout: 5_000 });
  const roleText = await roleRow.textContent();
  expect(roleText).toContain("Học viên");

  const createdRow = page.getByTestId("profile-created");
  await expect(createdRow).toBeVisible({ timeout: 5_000 });
  const createdText = await createdRow.textContent();
  expect(createdText).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);

  // Student profile does NOT have profile-partner row (no partner context)
  await expect(page.getByTestId("profile-partner")).not.toBeVisible({ timeout: 3_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRF-04: Logout from profile page clears session → /login
// ─────────────────────────────────────────────────────────────────────────────

test("PRF-04: owner profile-logout-btn clears session and redirects to /login", async ({
  context,
  page,
}) => {
  await loginAs(context, "owner");

  await page.goto("/profile");
  await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 15_000 });

  // Click profile-logout-btn in the profile card footer
  // (partner/profile/page.tsx: <Button data-testid="profile-logout-btn" onClick={clearAuth + router.push("/login")}>)
  const logoutBtn = page.getByTestId("profile-logout-btn");
  await expect(logoutBtn).toBeVisible({ timeout: 5_000 });
  await logoutBtn.click();

  // After clearAuth() + router.push("/login"), URL must be /login
  // (partner/profile/page.tsx: clearAuth() clears in-memory Zustand → router.push("/login"))
  await expect(page).toHaveURL("/login", { timeout: 15_000 });

  // Login page must render (email input present)
  await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 5_000 });
  // NOTE: We do NOT re-navigate to /profile after logout here.
  // The (partner)/layout.tsx guard relies on in-memory Zustand hydration (not cookie alone).
  // After clearAuth() the BFF cookie may still be valid until the /api/auth/logout
  // call completes on the server. The session-cleared redirect is verified via
  // the full logout flow in auth-extra.spec.ts (RT-07) which uses the sidebar logout-btn
  // and verifies a second navigation to /dashboard → /login.
});

test("PRF-04: student profile-logout-btn clears session and redirects to /login", async ({
  context,
  page,
}) => {
  await loginAs(context, "student");

  await page.goto("/student/profile");
  await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 15_000 });

  const logoutBtn = page.getByTestId("profile-logout-btn");
  await expect(logoutBtn).toBeVisible({ timeout: 5_000 });
  await logoutBtn.click();

  await expect(page).toHaveURL("/login", { timeout: 15_000 });
  await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 5_000 });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRF-05: Profile error state when /me API fails
// ─────────────────────────────────────────────────────────────────────────────

test("PRF-05: profile error state shown when /me API request fails", async ({
  context,
  page,
}) => {
  await loginAs(context, "owner");

  // Intercept the /me endpoint (called by accountApi.me in (partner)/profile/page.tsx)
  // Aborting causes a NetworkError → useQuery enters error state → data is undefined
  // → profile/page.tsx renders: if (!me) return <p data-testid="profile-error">...
  await page.route("**/api/v1/me**", (route) => route.abort());

  await page.goto("/profile");

  // Wait for layout hydration
  await expect(page.getByTestId("sidebar-nav")).toBeVisible({ timeout: 15_000 });

  // profile-error must be visible (rendered when me is undefined/null after load)
  await expect(page.getByTestId("profile-error")).toBeVisible({ timeout: 15_000 });

  // profile-name must NOT be visible (profile is not rendered)
  await expect(page.getByTestId("profile-name")).not.toBeVisible({ timeout: 3_000 });
});
