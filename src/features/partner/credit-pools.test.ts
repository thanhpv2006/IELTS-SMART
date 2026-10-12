import { describe, expect, it } from "vitest";
import { formatPoolSummary, packWarning } from "./credit-pools";
import type { CreditPack } from "./api";

const pack = (over: Partial<CreditPack>): CreditPack => ({
  id: "p1",
  name: "Gói test",
  unit_type: "speaking_part",
  credits_total: 2000,
  credits_remaining: 2000,
  purchased_at: new Date().toISOString(),
  expires_at: null,
  status: "active",
  ...over,
});

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("formatPoolSummary", () => {
  it("lists only pools with a balance, each with its own unit", () => {
    expect(
      formatPoolSummary({ legacy: 0, fulltest: 0, speaking_part: 2000, writing_task: 500 }),
    ).toBe("2.000 Part · 500 câu");
  });

  it("keeps showing the legacy pool for centres that only have that", () => {
    expect(formatPoolSummary({ legacy: 500, fulltest: 0, speaking_part: 0, writing_task: 0 })).toBe(
      "500 credit",
    );
  });

  it("never sums pools together", () => {
    const summary = formatPoolSummary({ legacy: 100, fulltest: 0, speaking_part: 20000, writing_task: 0 });
    expect(summary).not.toContain("20.100");
    expect(summary).toBe("20.000 Part · 100 credit");
  });

  it("falls back to 0 when every pool is empty or unknown", () => {
    expect(formatPoolSummary({ legacy: 0, fulltest: 0, speaking_part: 0, writing_task: 0 })).toBe("0");
    expect(formatPoolSummary(undefined)).toBe("0");
  });
});

describe("packWarning", () => {
  it("flags a pack down to a tenth of what it started with", () => {
    expect(packWarning(pack({ credits_remaining: 150 }))).toBe("low");
  });

  it("leaves a healthy pack alone", () => {
    expect(packWarning(pack({ credits_remaining: 900 }))).toBeNull();
  });

  it("flags a pack expiring within a month", () => {
    expect(packWarning(pack({ expires_at: inDays(20) }))).toBe("expiring");
  });

  it("leaves a pack expiring later alone", () => {
    expect(packWarning(pack({ expires_at: inDays(200) }))).toBeNull();
  });

  it("says nothing about a pack that is already spent or expired", () => {
    expect(packWarning(pack({ credits_remaining: 0, status: "depleted" }))).toBeNull();
    expect(packWarning(pack({ expires_at: inDays(-1), status: "expired" }))).toBeNull();
  });
});
