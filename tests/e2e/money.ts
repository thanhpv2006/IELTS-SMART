/**
 * Helpers for the money specs: buy a credit package, settle the order without
 * paying anyone, switch a centre's billing mode, and read the ledger back.
 *
 * Settlement goes through the product's own simulation seam — provider
 * `fake_dev` plus the per-user `simulate_payment` flag — so an order settles on
 * the same MarkPaidByID -> PaymentSink path a real SePay webhook takes. There is
 * no test-only shortcut in the backend to drift away from.
 */

import type { APIRequestContext } from "@playwright/test";
import { apiBase } from "../setup/auth";
import { accessTokenFor, adminAccessToken, poolBalance, provisionRun } from "./seat";

export { adminAccessToken, poolBalance, provisionRun };

export const MONEY_OWNER_EMAIL = "owner-money@e2e.local";
export const MONEY_STUDENT_EMAIL = "student-money@e2e.local";
export const MONEY_PARTNER_NAME = "E2E Money Center";
export const MONEY_PASSWORD = "Test@1234";

/**
 * The `credit`-mode half of the pair. A centre's mode cannot be toggled once its
 * pools hold a balance (`billing_mode_locked`), so the two modes are two centres
 * rather than one centre switched back and forth.
 */
export const MONEY_CREDIT_OWNER_EMAIL = "owner-money-credit@e2e.local";
export const MONEY_CREDIT_STUDENT_EMAIL = "student-money-credit@e2e.local";

/** The package the purchase specs buy — typed, so a `unit` centre can spend it. */
export const TYPED_PACKAGE_NAME = "Speaking — 2.000 Part";

export type CreditPackage = {
  id: string;
  name: string;
  unit_type: string;
  credits: number;
  price_vnd: number;
  active: boolean;
};

export type PurchaseResult = {
  order_id: string;
  checkout_url: string;
  amount: string;
  currency: string;
  purchase_id: string;
};

type LoginResult = { access_token: string; user_id: string };

/** Logs in and keeps the user id too — the flag override is addressed by id. */
export async function loginWithId(
  request: APIRequestContext,
  email: string,
  password = MONEY_PASSWORD,
): Promise<LoginResult> {
  const res = await request.post(`${apiBase()}/auth/login`, { data: { email, password } });
  if (!res.ok()) throw new Error(`login ${email} failed: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as Partial<LoginResult>;
  if (!body.access_token || !body.user_id) throw new Error(`login ${email} returned no token/user_id`);
  return { access_token: body.access_token, user_id: body.user_id };
}

export function moneyOwnerToken(request: APIRequestContext): Promise<string> {
  return accessTokenFor(request, MONEY_OWNER_EMAIL, MONEY_PASSWORD);
}

export function moneyStudentToken(request: APIRequestContext): Promise<string> {
  return accessTokenFor(request, MONEY_STUDENT_EMAIL, MONEY_PASSWORD);
}

export function creditOwnerToken(request: APIRequestContext): Promise<string> {
  return accessTokenFor(request, MONEY_CREDIT_OWNER_EMAIL, MONEY_PASSWORD);
}

export function creditStudentToken(request: APIRequestContext): Promise<string> {
  return accessTokenFor(request, MONEY_CREDIT_STUDENT_EMAIL, MONEY_PASSWORD);
}

export async function enableSimulatePayment(
  request: APIRequestContext,
  adminToken: string,
  userId: string,
): Promise<void> {
  const res = await request.put(`${apiBase()}/admin/feature-flags/simulate_payment/overrides`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { user_id: userId, enabled: true, reason: "e2e money specs" },
  });
  if (!res.ok()) throw new Error(`enable simulate_payment failed: ${res.status()} ${await res.text()}`);
}

export async function listPackages(
  request: APIRequestContext,
  token: string,
): Promise<CreditPackage[]> {
  const res = await request.get(`${apiBase()}/smart/credit/packages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`list credit packages failed: ${res.status()}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : (body.items ?? [])) as CreditPackage[];
}

export async function packageIdByName(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const found = (await listPackages(request, token)).find((p) => p.name === name);
  if (!found) throw new Error(`credit package "${name}" not sold to this centre — check its billing mode`);
  return found.id;
}

/** Ledger totals per pool, summed from billing.credit_events by the API. */
export async function usageByUnit(
  request: APIRequestContext,
  token: string,
): Promise<Record<string, number>> {
  const res = await request.get(`${apiBase()}/smart/credit/usage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`read credit usage failed: ${res.status()}`);
  const body = (await res.json()) as { usage?: Record<string, number> };
  return body.usage ?? {};
}

export async function packCount(request: APIRequestContext, token: string): Promise<number> {
  const res = await request.get(`${apiBase()}/smart/credit/packs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`list credit packs failed: ${res.status()}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : (body.items ?? [])).length;
}

export async function purchaseCount(request: APIRequestContext, token: string): Promise<number> {
  const res = await request.get(`${apiBase()}/smart/credit/purchases`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`list credit purchases failed: ${res.status()}`);
  const body = await res.json();
  return (Array.isArray(body) ? body : (body.items ?? [])).length;
}

export async function purchasePackage(
  request: APIRequestContext,
  token: string,
  packageId: string,
): Promise<PurchaseResult> {
  const res = await request.post(`${apiBase()}/smart/credit/purchase`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { package_id: packageId },
  });
  if (!res.ok()) throw new Error(`purchase failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as PurchaseResult;
}

export async function orderStatus(
  request: APIRequestContext,
  token: string,
  orderId: string,
): Promise<string> {
  const res = await request.get(`${apiBase()}/payment/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`read order failed: ${res.status()}`);
  const body = (await res.json()) as { status?: string };
  return body.status ?? "";
}

/** Returns the HTTP status so a caller can assert what a second settle does. */
export async function simulatePaid(
  request: APIRequestContext,
  token: string,
  orderId: string,
): Promise<number> {
  const res = await request.post(`${apiBase()}/payment/orders/${orderId}/simulate-paid`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.status();
}

export const MONEY_SET_NAME = "E2E Money Speaking Set";
export const MONEY_CREDIT_SET_NAME = "E2E Money Credit Speaking Set";
