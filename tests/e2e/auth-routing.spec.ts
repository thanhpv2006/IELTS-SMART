/**
 * E2E: Auth + Routing + Role-gating + Sidebar
 *
 * Matrix IDs covered:
 *   AUTH-01  No-session → root redirect → /login
 *   AUTH-06  Wrong password → error message shown, URL stays /login, no redirect
 *   RT-01    Unauthenticated → protected routes → /login
 *   RT-02    Authenticated per-role → open / → correct dashboard (see also RT-07)
 *   RT-04    Teacher opens owner-only route /teachers → INTENDED: /login [see RT04-A1]
 *   RT-05    Student opens /dashboard (partner route) → /login
 *   RT-06    Owner/teacher open /student/assignments → /login
 *   SHELL-01 Owner sidebar shows every owner nav item
 *   SHELL-02 Teacher sidebar does NOT show "Quản lý giáo viên"
 *   SHELL-03 Student sidebar shows only the student nav
 *
 * Auth stack (confirmed from source):
 *   - Access token: in-memory Zustand only
 *   - Refresh token: httpOnly cookie `ielts_smart_rt` (path: /api/auth)
 *   - Bootstrap: Providers.tsx calls POST /api/auth/refresh on mount → populates Zustand
 *   - Layout renders null while hydrating → tests must await visible content before asserting URL
 *   - storageState from global-setup carries the httpOnly cookie so bootstrap succeeds
 *
 * Nav item sources (confirmed from (partner)/layout.tsx and (student)/layout.tsx):
 *   OWNER_NAV  (6 items): overview /dashboard, assignments /assignments,
 *              teacher management /teachers, class management /classes,
 *              student management /students, question bank /banks
 *   TEACHER_NAV (5 items): overview /my-dashboard, assignments /assignments,
 *              class management /classes, student management /my-students, question bank /banks
 *   STUDENT_NAV (2 items): Dashboard /student/dashboard, assignments /student/assignments
 *
 * data-testid anchors (added/confirmed in source):
 *   sidebar-nav    → <nav> in app-shell.tsx (added)
 *   email-input    → login form (pre-existing)
 *   password-input → login form (pre-existing)
 *   login-submit   → login form (pre-existing)
 *   login-error    → error <p> in login/page.tsx (added)
 *
 * Assumptions (flag for integration review):
 *   A1  page.tsx root uses router.replace() which Playwright follows via navigation events.
 *       We await toHaveURL() which resolves once the navigation settles; 15 000ms covers
 *       hydration + /api/auth/refresh round-trip on localhost.
 *   A2  (partner)/layout.tsx guard: !accessToken → /login; role ∉ {partner_owner, teacher} → /login.
 *       Both owner AND teacher pass this guard (both allowed). Student does NOT pass.
 *   A3  (student)/layout.tsx guard: !accessToken → /login; role !== "student" → /login.
 *   A4  Sidebar nav links use Link title={item.label}. Playwright getByRole("link", { name })
 *       resolves the accessible name from the title attribute when aria-label is absent.
 *       All link labels are matched via this mechanism against OWNER/TEACHER/STUDENT_NAV.
 *   RT04-A1  KNOWN GAP: (partner)/layout.tsx allows role="teacher" past the guard.
 *       /teachers/page.tsx has no per-page role assertion for partner_owner only.
 *       The test is marked test.fail() to document the INTENDED behavior (redirect teacher
 *       to /login) without breaking the suite. Remove test.fail() once a page-level guard
 *       is added to (partner)/teachers/page.tsx.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../setup/auth";

// Auth: each describe logs in fresh per test (beforeEach) so every test gets its
// own refresh-token family — see loginAs() for why static storageState breaks.

// ── Nav label constants (mirror (partner)/layout.tsx + (student)/layout.tsx) ─
const OWNER_NAV_LABELS = [
  "Tổng quan",
  "Bài tập",
  "Quản lý giáo viên",
  "Quản lý lớp học",
  "Quản lý học viên",
  "Ngân hàng đề",
  "Quản lý gói",
  "Cài đặt",
] as const;

const TEACHER_NAV_LABELS = [
  "Tổng quan",
  "Bài tập",
  "Quản lý lớp học",
  "Quản lý học viên",
  "Ngân hàng đề",
] as const;

const STUDENT_NAV_LABELS = ["Dashboard", "Bài tập", "Luyện tập"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-01 / RT-01 — Unauthenticated access
// No test.use({ storageState }): browser has no cookies.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Unauthenticated access (AUTH-01 / RT-01)", () => {
  // Explicit: no storageState injected in this describe block.
  // The browser starts empty for each test.

  test("AUTH-01: unauthenticated root / → /login", async ({ page }) => {
    await page.goto("/");

    // page.tsx: hydrating → false; !accessToken → router.replace("/login")
    await expect(page).toHaveURL("/login", { timeout: 15_000 });

    // Confirm login page is rendered
    await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 5_000 });
  });

  test("RT-01: unauthenticated /dashboard → /login", async ({ page }) => {
    await page.goto("/dashboard");

    // (partner)/layout.tsx: hydrating done, !accessToken → router.replace("/login")
    await expect(page).toHaveURL("/login", { timeout: 15_000 });
    await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 5_000 });
  });

  test("RT-01: unauthenticated /student/assignments → /login", async ({ page }) => {
    await page.goto("/student/assignments");

    // (student)/layout.tsx: !accessToken → router.replace("/login")
    await expect(page).toHaveURL("/login", { timeout: 15_000 });
    await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-06 — Wrong password → error displayed, URL unchanged
// No storageState needed; tests the live BFF + login form.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Login error handling (AUTH-06)", () => {
  test("AUTH-06: wrong password shows error message, stays at /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByTestId("email-input")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("email-input").fill("owner@e2e.local");
    await page.getByTestId("password-input").fill("DefinitelyWrong!999");
    await page.getByTestId("login-submit").click();

    // data-testid="login-error" added to the error <p> in login/page.tsx
    await expect(page.getByTestId("login-error")).toBeVisible({ timeout: 10_000 });

    // URL must not have changed
    expect(new URL(page.url()).pathname).toBe("/login");

    // Submit must be enabled again (mutation settled, no stuck spinner)
    await expect(page.getByTestId("login-submit")).toBeEnabled({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT-02 — Authenticated per-role: / → role-specific dashboard
// Uses test.use({ storageState }) at describe level for clean cookie injection.
// ─────────────────────────────────────────────────────────────────────────────

test.describe("RT-02: owner / → /dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("owner navigates from / to /dashboard", async ({ page }) => {
    await page.goto("/");

    // page.tsx: role=partner_owner → router.replace("/dashboard")
    await expect(page).toHaveURL("/dashboard", { timeout: 15_000 });

    // Verify the owner dashboard page heading as content sentinel
    await expect(
      page.getByRole("heading", { name: /Tổng quan trung tâm/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("RT-02: teacher / → /my-dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("teacher navigates from / to /my-dashboard", async ({ page }) => {
    await page.goto("/");

    // page.tsx: role=teacher → router.replace("/my-dashboard")
    await expect(page).toHaveURL("/my-dashboard", { timeout: 15_000 });

    await expect(
      page.getByRole("heading", { name: /Tổng quan lớp/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("RT-02: student / → /student/assignments", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "student");
  });

  test("student navigates from / to /student/assignments", async ({ page }) => {
    await page.goto("/");

    // page.tsx: role=student → router.replace("/student/assignments")
    await expect(page).toHaveURL("/student/assignments", { timeout: 15_000 });

    // Student assignments page heading (assignments/page.tsx)
    await expect(
      page.getByRole("heading", { level: 1, name: "Bài tập" }),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT-05 — Student opens partner route /dashboard → /login
// ─────────────────────────────────────────────────────────────────────────────

test.describe("RT-05: student cross-role gating", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "student");
  });

  test("RT-05: student opens /dashboard → redirected to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // (partner)/layout.tsx: role="student" fails the guard
    // (role !== "partner_owner" && role !== "teacher") → router.replace("/login")
    await expect(page).toHaveURL("/login", { timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT-06 — Owner and teacher open student route → /login
// ─────────────────────────────────────────────────────────────────────────────

test.describe("RT-06: owner cross-role gating", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("RT-06: owner opens /student/assignments → redirected to /login", async ({
    page,
  }) => {
    await page.goto("/student/assignments");

    // (student)/layout.tsx: role !== "student" → router.replace("/login")
    await expect(page).toHaveURL("/login", { timeout: 15_000 });
  });
});

test.describe("RT-06: teacher cross-role gating", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("RT-06: teacher opens /student/assignments → redirected to /login", async ({
    page,
  }) => {
    await page.goto("/student/assignments");

    // (student)/layout.tsx: role !== "student" → router.replace("/login")
    await expect(page).toHaveURL("/login", { timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RT-04 — Teacher opens owner-only /teachers
//
// (partner)/layout.tsx admits both partner_owner AND teacher, so owner-only
// routes need an explicit per-route guard. OWNER_ONLY_PREFIXES (/dashboard,
// /teachers, /students) redirect a teacher to /my-dashboard. (Fixed in Phase 2.)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("RT-04: teacher owner-only route gating", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("RT-04: teacher opens /teachers → /my-dashboard", async ({ page }) => {
    // (partner)/layout.tsx now guards OWNER_ONLY_PREFIXES: a teacher opening the
    // owner-only /teachers route is redirected to their own /my-dashboard.
    await page.goto("/teachers");

    await expect(page).toHaveURL("/my-dashboard", { timeout: 15_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHELL-01 — Owner sidebar shows every owner nav item
// ─────────────────────────────────────────────────────────────────────────────

test.describe("SHELL-01: owner sidebar", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "owner");
  });

  test("SHELL-01: owner sees every owner nav item and nothing else", async ({ page }) => {
    await page.goto("/dashboard");

    // sidebar-nav only renders after hydration (layout returns null while
    // hydrating) — use it as the post-hydration sentinel.
    const sidebarNav = page.getByTestId("sidebar-nav");
    await expect(sidebarNav).toBeVisible({ timeout: 15_000 });

    // Every OWNER_NAV label must be a visible link in the sidebar
    for (const label of OWNER_NAV_LABELS) {
      await expect(
        sidebarNav.getByRole("link", { name: label }),
      ).toBeVisible({ timeout: 5_000 });
    }

    // No extras beyond the declared nav
    await expect(sidebarNav.getByRole("link")).toHaveCount(
      OWNER_NAV_LABELS.length,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHELL-02 — Teacher sidebar: 5 items, NO "Quản lý giáo viên"
// ─────────────────────────────────────────────────────────────────────────────

test.describe("SHELL-02: teacher sidebar", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "teacher");
  });

  test("SHELL-02: teacher has 5 nav items; Quản lý giáo viên absent", async ({
    page,
  }) => {
    await page.goto("/my-dashboard");

    const sidebarNav = page.getByTestId("sidebar-nav");
    await expect(sidebarNav).toBeVisible({ timeout: 15_000 });

    // All 5 teacher nav labels present
    for (const label of TEACHER_NAV_LABELS) {
      await expect(
        sidebarNav.getByRole("link", { name: label }),
      ).toBeVisible({ timeout: 5_000 });
    }

    // "Quản lý giáo viên" must be absent (owner-only)
    await expect(
      sidebarNav.getByRole("link", { name: "Quản lý giáo viên" }),
    ).not.toBeVisible();

    // Exactly 5 links
    await expect(sidebarNav.getByRole("link")).toHaveCount(
      TEACHER_NAV_LABELS.length,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SHELL-03 — Student sidebar: student nav only
// ─────────────────────────────────────────────────────────────────────────────

test.describe("SHELL-03: student sidebar", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "student");
  });

  test("SHELL-03: student sees only the student nav in the sidebar", async ({
    page,
  }) => {
    await page.goto("/student/assignments");

    await expect(
      page.getByRole("heading", { level: 1, name: "Bài tập" }),
    ).toBeVisible({ timeout: 15_000 });

    const sidebarNav = page.getByTestId("sidebar-nav");
    await expect(sidebarNav).toBeVisible({ timeout: 5_000 });

    // Both student nav labels present
    for (const label of STUDENT_NAV_LABELS) {
      await expect(
        sidebarNav.getByRole("link", { name: label }),
      ).toBeVisible({ timeout: 5_000 });
    }

    // Partner/teacher-specific items are absent
    await expect(
      sidebarNav.getByRole("link", { name: "Quản lý giáo viên" }),
    ).not.toBeVisible();
    await expect(
      sidebarNav.getByRole("link", { name: "Quản lý học viên" }),
    ).not.toBeVisible();
    await expect(
      sidebarNav.getByRole("link", { name: "Tổng quan" }),
    ).not.toBeVisible();

    // Exactly 2 links
    await expect(sidebarNav.getByRole("link")).toHaveCount(
      STUDENT_NAV_LABELS.length,
    );
  });
});
