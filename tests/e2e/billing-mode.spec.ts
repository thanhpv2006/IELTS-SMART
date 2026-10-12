/**
 * Billing mode (BM-01..03) — the mode a centre is on decides which pool a
 * submission drains, and which packages it is allowed to buy.
 *
 * Two centres, not one toggled: `PUT /admin/partners/{id}/billing-mode` answers
 * 409 `billing_mode_locked` while the current mode's pools still hold a balance,
 * so the mode is a durable property here, exactly as it is in production.
 */

import { test, expect } from "@playwright/test";
import {
  MONEY_CREDIT_SET_NAME,
  MONEY_CREDIT_STUDENT_EMAIL,
  MONEY_SET_NAME,
  MONEY_STUDENT_EMAIL,
  creditOwnerToken,
  creditStudentToken,
  listPackages,
  moneyOwnerToken,
  moneyStudentToken,
  poolBalance,
  provisionRun,
} from "./money";
import { submitSpeakingViaApi } from "./seat";

test.describe.configure({ mode: "serial" });

const TYPED_POOLS = ["fulltest", "speaking_part", "writing_task"];

test.describe("BM-01..03: billing mode decides the pool", () => {
  test("BM-01: a unit centre drains the typed pool and leaves legacy alone", async ({
    request,
  }) => {
    const ownerToken = await moneyOwnerToken(request);
    const typedBefore = await poolBalance(request, ownerToken, "speaking_part");
    const legacyBefore = await poolBalance(request, ownerToken, "legacy");

    const runId = await provisionRun(request, ownerToken, MONEY_STUDENT_EMAIL, MONEY_SET_NAME);
    await submitSpeakingViaApi(request, await moneyStudentToken(request), runId);

    expect(await poolBalance(request, ownerToken, "speaking_part")).toBeLessThan(typedBefore);
    expect(await poolBalance(request, ownerToken, "legacy")).toBe(legacyBefore);
  });

  test("BM-02: a credit centre drains the legacy pool and leaves typed alone", async ({
    request,
  }) => {
    const ownerToken = await creditOwnerToken(request);
    const typedBefore = await poolBalance(request, ownerToken, "speaking_part");
    const legacyBefore = await poolBalance(request, ownerToken, "legacy");

    const runId = await provisionRun(
      request,
      ownerToken,
      MONEY_CREDIT_STUDENT_EMAIL,
      MONEY_CREDIT_SET_NAME,
    );
    await submitSpeakingViaApi(request, await creditStudentToken(request), runId);

    expect(await poolBalance(request, ownerToken, "legacy")).toBeLessThan(legacyBefore);
    expect(await poolBalance(request, ownerToken, "speaking_part")).toBe(typedBefore);
  });

  test("BM-03: each centre is sold only what its mode could spend", async ({ request }) => {
    const unitPackages = await listPackages(request, await moneyOwnerToken(request));
    expect(unitPackages.length).toBeGreaterThan(0);
    expect(unitPackages.every((p) => TYPED_POOLS.includes(p.unit_type))).toBe(true);

    // Empty rather than "legacy only": migration 20260917120200 deactivated every
    // legacy package when the typed ones were introduced.
    expect(await listPackages(request, await creditOwnerToken(request))).toHaveLength(0);
  });
});
