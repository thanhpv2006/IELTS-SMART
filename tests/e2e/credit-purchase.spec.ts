/**
 * Buying credit (CP-01..03) — the money-in path, end to end on the real stack.
 *
 * Runs against E2E Money Center so the balances here never move the ones the
 * other centres' specs assert on. Settlement uses the product's own `fake_dev`
 * simulation seam, so no request ever leaves the stack.
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "../setup/auth";
import {
  MONEY_OWNER_EMAIL,
  TYPED_PACKAGE_NAME,
  adminAccessToken,
  enableSimulatePayment,
  loginWithId,
  moneyOwnerToken,
  orderStatus,
  packCount,
  packageIdByName,
  poolBalance,
  purchaseCount,
  purchasePackage,
  simulatePaid,
} from "./money";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const owner = await loginWithId(request, MONEY_OWNER_EMAIL);
  await enableSimulatePayment(request, await adminAccessToken(request), owner.user_id);
});

test.describe("CP-01..03: buying a credit package", () => {
  test("CP-01: paying for a package adds exactly that many credits", async ({
    context,
    page,
    request,
  }) => {
    const token = await moneyOwnerToken(request);
    const before = await poolBalance(request, token, "speaking_part");
    const purchasesBefore = await purchaseCount(request, token);

    await loginAs(context, "owner-money");
    await page.goto("/credit-packages");
    await page.getByRole("button", { name: "Mua thêm gói", exact: true }).click();

    // Scoped to the dialog: the purchase-history table behind it repeats the same
    // amount once per earlier run, so a page-wide match is ambiguous by the second run.
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: new RegExp(TYPED_PACKAGE_NAME) }).click();

    await expect(dialog.getByText("16.400.000")).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByAltText("Mã QR thanh toán")).toBeVisible();

    await dialog.getByRole("button", { name: "Giả lập đã thanh toán" }).click();
    await expect(dialog.getByText("Nạp thành công!")).toBeVisible({ timeout: 20_000 });

    expect(await poolBalance(request, token, "speaking_part")).toBe(before + 2000);
    expect(await purchaseCount(request, token)).toBe(purchasesBefore + 1);
  });

  test("CP-02: settling the same order twice mints one pack", async ({ request }) => {
    const token = await moneyOwnerToken(request);
    const packageId = await packageIdByName(request, token, TYPED_PACKAGE_NAME);
    const order = await purchasePackage(request, token, packageId);

    expect(await simulatePaid(request, token, order.order_id)).toBeLessThan(300);
    expect(await orderStatus(request, token, order.order_id)).toBe("paid");

    const balanceAfterFirst = await poolBalance(request, token, "speaking_part");
    const packsAfterFirst = await packCount(request, token);

    const secondStatus = await simulatePaid(request, token, order.order_id);

    expect(
      await poolBalance(request, token, "speaking_part"),
      `balance moved on the second settle (HTTP ${secondStatus})`,
    ).toBe(balanceAfterFirst);
    expect(
      await packCount(request, token),
      `a second pack was minted (HTTP ${secondStatus})`,
    ).toBe(packsAfterFirst);
  });

  test("CP-03: an unknown package is refused and leaves no purchase behind", async ({
    request,
  }) => {
    const token = await moneyOwnerToken(request);
    const before = await purchaseCount(request, token);

    const res = await request.post(
      `${process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api/v1"}/smart/credit/purchase`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { package_id: "00000000-0000-0000-0000-000000000000" },
      },
    );

    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    expect(await purchaseCount(request, token)).toBe(before);
  });
});
