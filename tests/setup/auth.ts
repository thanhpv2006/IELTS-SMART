/**
 * Auth helper utilities for E2E tests.
 *
 * Auth architecture summary (confirmed from source):
 *   - Access token: in-memory Zustand only (NOT in localStorage)
 *   - Refresh token: httpOnly cookie `ielts_smart_rt` (path: /api/auth), set by BFF
 *   - Bootstrap flow: Providers.tsx calls POST /api/auth/refresh on mount → gets access token
 *   - localStorage key `ielts_smart_auth` in E2E-CONTRACT refers to the Zustand store key
 *     (Zustand v5 default key), but actual runtime auth is in-memory via cookie refresh.
 *
 * Playwright storageState strategy:
 *   - Save the httpOnly cookie after login so each test page can bootstrap auth
 *     via the normal /api/auth/refresh flow (exactly what a real browser does).
 *   - storageState JSON includes `cookies` array → Playwright replays the cookie
 *     → /api/auth/refresh succeeds → Zustand in-memory access token is populated.
 */

import type { Page, BrowserContext } from "@playwright/test";

export type SeedRole =
  | "student"
  | "owner"
  | "teacher"
  | "student-nocredit"
  | "student-review"
  | "student-writing"
  | "student-done"
  // Seed-gap fixture accounts (extend seed 2026-06-30) — unblock fixme cases
  | "teacher-empty"
  | "student-empty"
  | "student-noq"
  | "student-overdue"
  | "student-stimulus"
  | "student-lowconf"
  | "student-writing-done"
  | "owner-seat"
  | "student-seat"
  | "owner-money"
  | "student-money"
  | "owner-money-credit"
  | "student-money-credit";

/**
 * Returns the BFF base URL (Next.js) for use in global-setup.
 * Must match the baseURL in playwright.config.ts.
 */
export function bffBase(): string {
  return process.env.E2E_WEB_BASE ?? "http://localhost:3004";
}

/**
 * Returns the internal API base URL (backend) for direct API calls in setup.
 * Note: login goes through BFF /api/auth/login (which sets the httpOnly cookie).
 */
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1";
}

/** E2E seed accounts per E2E-CONTRACT.md */
export const SEED_ACCOUNTS: Record<SeedRole, { email: string; password: string }> = {
  student: { email: "student@e2e.local", password: "Test@1234" },
  owner: { email: "owner@e2e.local", password: "Test@1234" },
  teacher: { email: "teacher@e2e.local", password: "Test@1234" },
  // Phase 2 accounts (E2E-CONTRACT.md §"Phase 2 — assignment bổ sung")
  "student-nocredit": { email: "student-nocredit@e2e.local", password: "Test@1234" },
  "student-review": { email: "student-review@e2e.local", password: "Test@1234" },
  // Wave 0 v2 accounts (E2E-CONTRACT.md §"Seed inventory v2")
  "student-writing": { email: "student-writing@e2e.local", password: "Test@1234" },
  "student-done": { email: "student-done@e2e.local", password: "Test@1234" },
  // Seed-gap fixture accounts (extend seed 2026-06-30)
  "teacher-empty": { email: "teacher-empty@e2e.local", password: "Test@1234" },
  "student-empty": { email: "student-empty@e2e.local", password: "Test@1234" },
  "student-noq": { email: "student-noq@e2e.local", password: "Test@1234" },
  "student-overdue": { email: "student-overdue@e2e.local", password: "Test@1234" },
  "student-stimulus": { email: "student-stimulus@e2e.local", password: "Test@1234" },
  "student-lowconf": { email: "student-lowconf@e2e.local", password: "Test@1234" },
  "student-writing-done": { email: "student-writing-done@e2e.local", password: "Test@1234" },
  "owner-seat": { email: "owner-seat@e2e.local", password: "Test@1234" },
  "student-seat": { email: "student-seat@e2e.local", password: "Test@1234" },
  // Money specs (E2E-CONTRACT.md §"E2E Money Center")
  "owner-money": { email: "owner-money@e2e.local", password: "Test@1234" },
  "student-money": { email: "student-money@e2e.local", password: "Test@1234" },
  "owner-money-credit": { email: "owner-money-credit@e2e.local", password: "Test@1234" },
  "student-money-credit": { email: "student-money-credit@e2e.local", password: "Test@1234" },
};

/**
 * Fresh per-test login: POST the BFF /api/auth/login so the httpOnly refresh
 * cookie lands on THIS test's browser context. Each call mints a new session
 * (own refresh-token family), so the browser context can rotate the cookie
 * naturally as it refreshes — no cross-test reuse.
 *
 * Why not a shared storageState file? The backend rotates the refresh token on
 * every /api/auth/refresh and only tolerates ~one rotated-token reuse (grace
 * window). A static storageState replays the SAME original token for every
 * test, so the 3rd+ reuse trips reuse-detection → 401 → redirect /login.
 * Logging in per test sidesteps that entirely.
 */
export async function loginAs(
  context: BrowserContext,
  role: SeedRole,
): Promise<void> {
  const acc = SEED_ACCOUNTS[role];
  const res = await context.request.post(`${bffBase()}/api/auth/login`, {
    data: { email: acc.email, password: acc.password },
    headers: { Origin: bffBase(), "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(
      `loginAs(${role}) failed: ${res.status()} ${await res.text()}`,
    );
  }
}

/**
 * Injects the Zustand auth state directly into a page's localStorage.
 *
 * Use case: when you already have an accessToken (from a direct backend login
 * in global-setup) and want to bypass the cookie+refresh flow. Useful for
 * cases where the BFF /api/auth/refresh is not yet wired or for unit-level
 * integration tests that skip the full bootstrap.
 *
 * Shape: { accessToken, userId, role, plan } — matches SessionData in auth-store.ts.
 *
 * NOTE: The E2E-CONTRACT lists localStorage key `ielts_smart_auth`.
 * Zustand v5 with no persistence plugin does NOT write to localStorage by default.
 * If the app adds zustand/middleware persist later, update this helper accordingly.
 * For now this function is provided as a fallback only.
 */
export async function seedLocalStorageAuth(
  page: Page,
  session: { accessToken: string; userId: string; role: string; plan: string },
) {
  await page.addInitScript((s) => {
    // Inject before any React hydration so Zustand picks it up if persist is added
    window.localStorage.setItem("ielts_smart_auth", JSON.stringify(s));
  }, session);
}
