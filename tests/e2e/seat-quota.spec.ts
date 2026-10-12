/**
 * E2E spec: what a centre owner sees of its account plan, and how a monthly
 * seat allowance is spent before the prepaid pool.
 *
 * Seed requirements (cmd/seed-e2e, "E2E Seat Center"): owner-seat + student-seat
 * + student-seat2, a speaking set with one item per Part 1/2/3 (3 billable
 * units), two pending assignments for student-seat, and a speaking_part pool
 * with NO legacy pool so the overflow charge is readable as a Part count.
 *
 * Quota does not roll over, so a re-run needs a fresh seed (e2e-down.sh &&
 * e2e-up.sh), same as review-band/no-credit.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../setup/auth";
import {
  accessTokenFor,
  adminAccessToken,
  cancelActiveContracts,
  findPartnerIdByName,
  findStudentIdByEmail,
  provisionRun,
  poolBalance,
  signContract,
  submitSpeakingViaApi,
  SEAT_OWNER,
  SEAT_PARTNER_NAME,
  SEAT_BANK_SET_NAME,
  SEAT_STUDENT,
} from "./seat";

test.setTimeout(120_000);


test.describe.serial("centre without an account plan", () => {
  test.beforeAll(async ({ request }) => {
    const token = await adminAccessToken(request);
    const partnerId = await findPartnerIdByName(request, token, SEAT_PARTNER_NAME);
    await cancelActiveContracts(request, token, partnerId);
  });

  test("shows an empty state instead of zeroed quotas", async ({ context, page }) => {
    await loginAs(context, "owner-seat");
    await page.goto("/credit-packages");

    await expect(page.getByText("Trung tâm chưa có gói tài khoản")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("0 Part Speaking")).toHaveCount(0);
    await expect(page.getByText("0 câu Writing")).toHaveCount(0);
  });

  test("leaves the monthly quota column blank", async ({ context, page, request }) => {
    await loginAs(context, "owner-seat");
    const ownerToken = await accessTokenFor(request, SEAT_OWNER.email, SEAT_OWNER.password);
    const studentId = await findStudentIdByEmail(request, ownerToken, SEAT_STUDENT.email);

    await page.goto("/students");
    const row = page.getByTestId(`student-row-${studentId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("—");
  });
});

test.describe.serial("centre on a Standard plan", () => {
  let adminToken = "";
  let partnerId = "";
  let ownerToken = "";
  let studentId = "";

  test.beforeAll(async ({ request }) => {
    adminToken = await adminAccessToken(request);
    partnerId = await findPartnerIdByName(request, adminToken, SEAT_PARTNER_NAME);
    await cancelActiveContracts(request, adminToken, partnerId);

    const res = await signContract(request, adminToken, partnerId, {
      plan_code: "standard",
      seats: 2,
      term_months: 1,
      note: "e2e — seat quota",
    });
    expect(res.status()).toBe(201);
    const contract = await res.json();
    expect(
      contract.quota_speaking_part,
      'signed contract must carry 2 Part Speaking — the "standard" plan looks edited, check seat-contract-api.spec.ts cleanup',
    ).toBe(2);

    ownerToken = await accessTokenFor(request, SEAT_OWNER.email, SEAT_OWNER.password);
    studentId = await findStudentIdByEmail(request, ownerToken, SEAT_STUDENT.email);
  });

  test.afterAll(async ({ request }) => {
    await cancelActiveContracts(request, adminToken, partnerId);
  });

  test("owner sees the plan, its seats and its monthly quota", async ({ context, page }) => {
    await loginAs(context, "owner-seat");
    await page.goto("/credit-packages");

    await expect(page.getByText("Standard", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Số tài khoản")).toBeVisible();
    await expect(page.getByText(/2 Part Speaking · 2 câu Writing/)).toBeVisible();
    await expect(page.getByText(/lượt Fulltest/)).toHaveCount(0);
  });

  test("quota covers two Parts and the pool pays the third", async ({ context, page, request }) => {
    const before = await poolBalance(request, ownerToken, "speaking_part");

    const studentToken = await accessTokenFor(request, SEAT_STUDENT.email, SEAT_STUDENT.password);
    // Provisioned, not taken from the seed: a spec that eats its fixture passes once
    // per fresh seed and then fails every rerun against the same stack.
    const assignmentId = await provisionRun(request, ownerToken, SEAT_STUDENT.email, SEAT_BANK_SET_NAME);
    await submitSpeakingViaApi(request, studentToken, assignmentId);

    await loginAs(context, "owner-seat");
    await page.goto("/students");
    const row = page.getByTestId(`student-row-${studentId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("2/2 Part");

    const after = await poolBalance(request, ownerToken, "speaking_part");
    expect(before - after).toBe(1);
  });

  test("a spent allowance sends the whole submission to the pool", async ({
    context,
    page,
    request,
  }) => {
    const before = await poolBalance(request, ownerToken, "speaking_part");

    const studentToken = await accessTokenFor(request, SEAT_STUDENT.email, SEAT_STUDENT.password);
    // Provisioned, not taken from the seed: a spec that eats its fixture passes once
    // per fresh seed and then fails every rerun against the same stack.
    const assignmentId = await provisionRun(request, ownerToken, SEAT_STUDENT.email, SEAT_BANK_SET_NAME);
    await submitSpeakingViaApi(request, studentToken, assignmentId);

    await loginAs(context, "owner-seat");
    await page.goto("/students");
    const row = page.getByTestId(`student-row-${studentId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("2/2 Part");

    const after = await poolBalance(request, ownerToken, "speaking_part");
    expect(before - after).toBe(3);
  });
});

test.describe.serial("centre that outgrew its seats", () => {
  let adminToken = "";
  let partnerId = "";

  test.beforeAll(async ({ request }) => {
    adminToken = await adminAccessToken(request);
    partnerId = await findPartnerIdByName(request, adminToken, SEAT_PARTNER_NAME);
    await cancelActiveContracts(request, adminToken, partnerId);

    const res = await signContract(request, adminToken, partnerId, {
      plan_code: "standard",
      seats: 1,
      term_months: 1,
      note: "e2e — over seats",
    });
    expect(res.status()).toBe(201);
  });

  test.afterAll(async ({ request }) => {
    await cancelActiveContracts(request, adminToken, partnerId);
  });

  test("warns about the overrun without blocking anything", async ({ context, page }) => {
    await loginAs(context, "owner-seat");
    await page.goto("/credit-packages");

    await expect(page.getByText(/vượt 1 tài khoản so với hợp đồng/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "Mua thêm gói", exact: true }),
    ).toBeVisible();
  });
});
