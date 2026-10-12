import type { CreditPack, CreditUnitType } from "./api";

export const POOL_ORDER: CreditUnitType[] = ["fulltest", "speaking_part", "writing_task", "legacy"];

// The legacy pool keeps the plain name centres already know it by: renaming it
// "Credit cũ" told every existing centre their balance had been superseded.
export const POOL_LABELS: Record<CreditUnitType, string> = {
  fulltest: "Lượt Fulltest",
  speaking_part: "Part Speaking",
  writing_task: "Câu Writing",
  legacy: "Credit",
};

export const POOL_UNITS: Record<CreditUnitType, string> = {
  fulltest: "lượt",
  speaking_part: "Part",
  writing_task: "câu",
  legacy: "credit",
};

const LOW_BALANCE_RATIO = 0.1;
const EXPIRING_SOON_DAYS = 30;

/** Pools never convert into each other, so each one keeps its own unit instead
 *  of being summed into a single misleading number. */
export function formatPoolSummary(balances?: Partial<Record<CreditUnitType, number>>): string {
  if (!balances) return "0";
  const parts = POOL_ORDER.filter((pool) => (balances[pool] ?? 0) > 0).map(
    (pool) => `${(balances[pool] ?? 0).toLocaleString("vi-VN")} ${POOL_UNITS[pool]}`,
  );
  return parts.length ? parts.join(" · ") : "0";
}

export type PackWarning = "low" | "expiring";

export function packWarning(pack: CreditPack): PackWarning | null {
  if (pack.status !== "active") return null;
  if (pack.credits_total > 0 && pack.credits_remaining <= pack.credits_total * LOW_BALANCE_RATIO) {
    return "low";
  }
  if (pack.expires_at) {
    const daysLeft = (new Date(pack.expires_at).getTime() - Date.now()) / 86_400_000;
    if (daysLeft <= EXPIRING_SOON_DAYS) return "expiring";
  }
  return null;
}

export const PACK_WARNING_LABELS: Record<PackWarning, string> = {
  low: "Sắp cạn",
  expiring: "Sắp hết hạn",
};
