/**
 * Playwright global setup — runs ONCE before all specs.
 *
 * Responsibility: log in each seed role via the BFF (POST /api/auth/login),
 * which sets the httpOnly cookie `ielts_smart_rt`. Save browser storageState
 * (cookies + localStorage) to tests/setup/.auth/<role>.json.
 *
 * How auth bootstrap works at runtime (confirmed from providers.tsx:31):
 *   Page load → Providers calls POST /api/auth/refresh → reads ielts_smart_rt cookie
 *   → returns access_token → Zustand in-memory access token populated.
 *
 * So saving cookies in storageState is all we need. No localStorage manipulation
 * required unless the app adds Zustand persist middleware in the future.
 *
 * CSRF note (confirmed from src/lib/auth/csrf.ts + BFF route):
 *   BFF /api/auth/login uses assertSameOrigin which checks Origin or Referer header.
 *   We pass Origin header explicitly in the fetch call below.
 */

import { chromium, type FullConfig } from "@playwright/test";
import path from "path";
import { bffBase, SEED_ACCOUNTS, type SeedRole } from "./auth";

const AUTH_DIR = path.join(__dirname, ".auth");

interface BffLoginResponse {
  access_token: string;
  access_expires_at: string;
  user_id: string;
  role: string;
  plan: string;
}

async function loginRole(
  bffBaseUrl: string,
  role: SeedRole,
): Promise<void> {
  const account = SEED_ACCOUNTS[role];
  const outPath = path.join(AUTH_DIR, `${role}.json`);

  // Launch a headless browser context just to perform the login request
  // so that the httpOnly cookie is properly stored by the browser engine.
  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Navigate to the app first so cookies are associated with the correct origin
  const page = await context.newPage();

  // Load the login page so the origin is established (needed for assertSameOrigin)
  await page.goto(`${bffBaseUrl}/login`, { waitUntil: "domcontentloaded" });

  // Call BFF login endpoint — cookie will be set by the BFF route handler
  const response = await page.request.post(`${bffBaseUrl}/api/auth/login`, {
    headers: {
      "Content-Type": "application/json",
      // assertSameOrigin checks Origin header; must match the Next.js origin
      Origin: bffBaseUrl,
    },
    data: {
      email: account.email,
      password: account.password,
    },
  });

  if (!response.ok()) {
    let errBody = "";
    try { errBody = await response.text(); } catch { /* ignore */ }
    throw new Error(
      `[global-setup] Login failed for role="${role}" email="${account.email}" ` +
      `status=${response.status()} body=${errBody}`,
    );
  }

  const data = (await response.json()) as BffLoginResponse;
  console.log(
    `[global-setup] Logged in role=${role} userId=${data.user_id} plan=${data.plan}`,
  );

  // Save the full browser storage state (cookies include ielts_smart_rt)
  await context.storageState({ path: outPath });
  console.log(`[global-setup] Saved storageState → ${outPath}`);

  await browser.close();
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const bffBaseUrl = bffBase();
  console.log(`[global-setup] BFF base: ${bffBaseUrl}`);

  // Seed student (required for take-speaking.spec.ts)
  await loginRole(bffBaseUrl, "student");

  // Seed owner (available for future partner-flow specs)
  await loginRole(bffBaseUrl, "owner");

  // Seed teacher (required for auth-routing.spec.ts role-gating + sidebar tests)
  await loginRole(bffBaseUrl, "teacher");

  console.log("[global-setup] All auth states seeded.");
}
