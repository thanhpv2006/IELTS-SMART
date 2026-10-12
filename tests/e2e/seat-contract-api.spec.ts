/**
 * E2E spec: account-plan contract rules, through the admin API — no browser.
 * Signing is admin-only and its UI lives in ielts-smart-admin, which has no
 * Playwright setup, but these rules carry the money so they are asserted here.
 *
 * Seed requirements: partner "E2E Seat Center" with two students, and
 * admin@e2e.local with role=admin.
 *
 * The snapshot case mutates a throwaway plan it creates rather than `standard`:
 * seat-quota.spec.ts signs from `standard`, and one crash mid-spec would leave
 * that plan skewed for every later run.
 */

import { test, expect } from "@playwright/test";
import {
  adminAccessToken,
  cancelActiveContracts,
  cancelContract,
  findPartnerIdByName,
  listContracts,
  signContract,
  SEAT_PARTNER_NAME,
} from "./seat";
import { apiBase } from "../setup/auth";

const SNAPSHOT_PLAN_CODE = "e2e_snapshot_plan";

const SNAPSHOT_PLAN_BODY = {
  code: SNAPSHOT_PLAN_CODE,
  name: "E2E Snapshot Plan",
  quota_fulltest: 0,
  quota_speaking_part: 2,
  quota_writing_task: 0,
  features: {},
  prices: [{ term_months: 1, price_per_seat_vnd: 1000 }],
  sort_order: 999,
};

test.describe.serial("seat contract rules (admin API)", () => {
  let token = "";
  let partnerId = "";

  test.beforeAll(async ({ request }) => {
    token = await adminAccessToken(request);
    partnerId = await findPartnerIdByName(request, token, SEAT_PARTNER_NAME);
    await cancelActiveContracts(request, token, partnerId);
  });

  test.afterAll(async ({ request }) => {
    await cancelActiveContracts(request, token, partnerId);
    await request.post(`${apiBase()}/admin/seat-plans/${SNAPSHOT_PLAN_CODE}/active`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { active: false },
    });
  });

  test("signing freezes the price of the chosen term", async ({ request }) => {
    const res = await signContract(request, token, partnerId, {
      plan_code: "standard",
      seats: 3,
      term_months: 6,
      note: "e2e — term price",
    });
    expect(res.status()).toBe(201);

    const contract = await res.json();
    expect(contract.price_per_seat_vnd).toBe(19000);
    expect(contract.total_vnd).toBe(19000 * 3 * 6);
    expect(contract.quota_speaking_part).toBe(2);
    expect(contract.quota_fulltest).toBe(0);

    const startsAt = new Date(contract.starts_at);
    const endsAt = new Date(contract.ends_at);
    const expectedEnd = new Date(startsAt);
    expectedEnd.setMonth(expectedEnd.getMonth() + 6);
    expect(endsAt.toISOString()).toBe(expectedEnd.toISOString());
  });

  test("a centre may hold only one contract in force", async ({ request }) => {
    const res = await signContract(request, token, partnerId, {
      plan_code: "standard",
      seats: 1,
      term_months: 1,
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("seat_contract_conflict");

    const { items } = await listContracts(request, token, partnerId);
    expect(items.filter((c) => c.status === "active")).toHaveLength(1);
  });

  test("a term the plan does not price is rejected", async ({ request }) => {
    await cancelActiveContracts(request, token, partnerId);
    const res = await signContract(request, token, partnerId, {
      plan_code: "standard",
      seats: 1,
      term_months: 12,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("invalid_seat_contract");
  });

  test("cancelling frees the centre to sign again", async ({ request }) => {
    const first = await signContract(request, token, partnerId, {
      plan_code: "standard",
      seats: 1,
      term_months: 1,
    });
    expect(first.status()).toBe(201);
    const firstId = (await first.json()).id as string;

    await cancelContract(request, token, partnerId, firstId);

    const { items } = await listContracts(request, token, partnerId);
    expect(items.find((c) => c.id === firstId)?.status).toBe("cancelled");

    const second = await signContract(request, token, partnerId, {
      plan_code: "standard",
      seats: 1,
      term_months: 1,
    });
    expect(second.status()).toBe(201);
    await cancelContract(request, token, partnerId, (await second.json()).id as string);
  });

  test("editing a plan does not rewrite a contract already signed", async ({ request }) => {
    const created = await request.post(`${apiBase()}/admin/seat-plans`, {
      headers: { Authorization: `Bearer ${token}` },
      data: SNAPSHOT_PLAN_BODY,
    });
    if (!created.ok()) {
      const reset = await request.patch(`${apiBase()}/admin/seat-plans/${SNAPSHOT_PLAN_CODE}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ...SNAPSHOT_PLAN_BODY, code: undefined },
      });
      expect(reset.ok()).toBe(true);
      const reactivate = await request.post(
        `${apiBase()}/admin/seat-plans/${SNAPSHOT_PLAN_CODE}/active`,
        { headers: { Authorization: `Bearer ${token}` }, data: { active: true } },
      );
      expect(reactivate.ok()).toBe(true);
    }

    const signed = await signContract(request, token, partnerId, {
      plan_code: SNAPSHOT_PLAN_CODE,
      seats: 1,
      term_months: 1,
    });
    expect(signed.status()).toBe(201);
    const contractId = (await signed.json()).id as string;

    const bumped = await request.patch(`${apiBase()}/admin/seat-plans/${SNAPSHOT_PLAN_CODE}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { quota_speaking_part: 3 },
    });
    expect(bumped.ok()).toBe(true);

    const { items } = await listContracts(request, token, partnerId);
    expect(items.find((c) => c.id === contractId)?.quota_speaking_part).toBe(2);
  });
});
