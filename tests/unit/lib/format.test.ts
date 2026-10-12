/**
 * Unit tests for date-range / format helpers.
 * Sources:
 *   src/components/ui/date-range-picker.tsx   — toDateStr, addDays, startOfWeek, startOfMonth, formatDisplay
 *   src/features/partner/class-format.ts      — formatDate, shortDate, classDateRange, studentLabel, progressClass, levelBadgeClass
 *   src/features/partner/dashboard-charts.tsx — fmtMs, dayLabel, completionFromDaily
 *
 * Case IDs:
 *   CMP-05 — date-range logic / vi-VN display format
 *   SHELL-05 — fmtMs formatting (ms → human-readable)
 */
import { describe, it, expect } from "vitest";

// date-range-picker helpers
import {
  toDateStr,
  addDays,
  startOfWeek,
  startOfMonth,
  formatDisplay,
} from "@/components/ui/date-range-picker";

import {
  formatDate,
  shortDate,
  classDateRange,
  studentLabel,
  progressClass,
  levelBadgeClass,
} from "@/features/partner/class-format";

import { fmtMs, dayLabel, completionFromDaily } from "@/features/partner/dashboard-charts";

import type { SmartClass } from "@/features/partner/api";

// ── toDateStr — CMP-05 ────────────────────────────────────────────────────────
// toDateStr uses Date.toISOString() which is UTC-based. Construct dates with
// Date.UTC() to avoid local-timezone off-by-one errors.

describe("toDateStr — CMP-05", () => {
  it("CMP-05: formats a Date to YYYY-MM-DD", () => {
    expect(toDateStr(new Date(Date.UTC(2025, 0, 5)))).toBe("2025-01-05");
  });

  it("CMP-05: zero-pads month and day", () => {
    expect(toDateStr(new Date(Date.UTC(2024, 8, 7)))).toBe("2024-09-07");
  });
});

// ── addDays — CMP-05 ──────────────────────────────────────────────────────────
// Use Date.UTC() constructors so that toDateStr (which uses toISOString/UTC)
// returns the expected YYYY-MM-DD without timezone shift.

describe("addDays — CMP-05", () => {
  it("CMP-05: adds positive days", () => {
    const base = new Date(Date.UTC(2025, 0, 1));
    const result = addDays(base, 6);
    expect(toDateStr(result)).toBe("2025-01-07");
  });

  it("CMP-05: subtracts days when n is negative", () => {
    const base = new Date(Date.UTC(2025, 0, 10));
    const result = addDays(base, -9);
    expect(toDateStr(result)).toBe("2025-01-01");
  });

  it("CMP-05: original Date is not mutated", () => {
    const base = new Date(Date.UTC(2025, 5, 15));
    const original = base.getTime();
    addDays(base, 10);
    expect(base.getTime()).toBe(original);
  });

  it("CMP-05: adding 0 days returns same date", () => {
    const base = new Date(Date.UTC(2025, 3, 20));
    expect(toDateStr(addDays(base, 0))).toBe("2025-04-20");
  });

  it("CMP-05: month rollover works correctly", () => {
    const base = new Date(Date.UTC(2025, 0, 29)); // Jan 29 UTC
    expect(toDateStr(addDays(base, 3))).toBe("2025-02-01");
  });
});

// ── startOfWeek — CMP-05 ─────────────────────────────────────────────────────
// startOfWeek/startOfMonth operate on local-time date components. Assert the
// local date components (getFullYear/Month/Date) rather than converting via
// toDateStr (which uses UTC toISOString and would shift by timezone).

describe("startOfWeek — CMP-05", () => {
  it("CMP-05: Sunday is already start of week (day=0)", () => {
    // 2025-01-05 is a Sunday
    const sunday = new Date(2025, 0, 5);
    const result = startOfWeek(sunday);
    expect(result.getDay()).toBe(0); // still Sunday
    expect(result.getDate()).toBe(5);
    expect(result.getMonth()).toBe(0);
    expect(result.getFullYear()).toBe(2025);
  });

  it("CMP-05: Wednesday steps back to preceding Sunday", () => {
    // 2025-01-08 is Wednesday (day=3), preceding Sunday = 2025-01-05
    const wednesday = new Date(2025, 0, 8);
    const result = startOfWeek(wednesday);
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(5);
    expect(result.getMonth()).toBe(0);
  });

  it("CMP-05: Saturday steps back to preceding Sunday", () => {
    // 2025-01-11 is Saturday (day=6), preceding Sunday = 2025-01-05
    const saturday = new Date(2025, 0, 11);
    const result = startOfWeek(saturday);
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(5);
    expect(result.getMonth()).toBe(0);
  });
});

// ── startOfMonth — CMP-05 ────────────────────────────────────────────────────

describe("startOfMonth — CMP-05", () => {
  it("CMP-05: returns first day of January", () => {
    const result = startOfMonth(new Date(2025, 0, 20));
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(0);
    expect(result.getFullYear()).toBe(2025);
  });

  it("CMP-05: returns first day of February (leap year)", () => {
    const result = startOfMonth(new Date(2024, 1, 29));
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(1);
    expect(result.getFullYear()).toBe(2024);
  });

  it("CMP-05: returns first day of December", () => {
    const result = startOfMonth(new Date(2025, 11, 31));
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(11);
    expect(result.getFullYear()).toBe(2025);
  });
});

// ── formatDisplay — CMP-05 ────────────────────────────────────────────────────

describe("formatDisplay — CMP-05", () => {
  it("CMP-05: formats a range as dd/mm/yy - dd/mm/yy", () => {
    expect(formatDisplay("2025-06-01", "2025-06-30")).toBe("01/06/25 - 30/06/25");
  });

  it("CMP-05: single-day range (from === to)", () => {
    expect(formatDisplay("2025-01-15", "2025-01-15")).toBe("15/01/25 - 15/01/25");
  });

  it("CMP-05: cross-year range is formatted correctly", () => {
    expect(formatDisplay("2024-12-25", "2025-01-05")).toBe("25/12/24 - 05/01/25");
  });

  it("CMP-05: year portion uses 2-digit slice (yy)", () => {
    // Ensure the separator between dates is " - " (with spaces)
    const result = formatDisplay("2025-06-29", "2025-06-29");
    expect(result).toContain(" - ");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{2} - \d{2}\/\d{2}\/\d{2}$/);
  });
});

// ── formatDate (class-format.ts) ─────────────────────────────────────────────

describe("formatDate (class-format) — CMP-05", () => {
  it("CMP-05: converts YYYY-MM-DD to DD/MM/YYYY", () => {
    expect(formatDate("2025-06-29")).toBe("29/06/2025");
  });

  it("CMP-05: returns --/--/---- when value is undefined", () => {
    expect(formatDate(undefined)).toBe("--/--/----");
  });

  it("CMP-05: zero-pads single-digit day and month", () => {
    expect(formatDate("2025-01-05")).toBe("05/01/2025");
  });
});

// ── shortDate ────────────────────────────────────────────────────────────────

describe("shortDate — CMP-05", () => {
  it("CMP-05: returns DD/MM from ISO timestamp", () => {
    // Use a fixed UTC midnight to avoid timezone ambiguity
    const result = shortDate("2025-06-29T00:00:00.000Z");
    // Exact date may shift by timezone; we just verify shape
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });

  it("CMP-05: returns empty string when value is undefined", () => {
    expect(shortDate(undefined)).toBe("");
  });
});

// ── classDateRange ────────────────────────────────────────────────────────────

describe("classDateRange — CMP-05", () => {
  function makeClass(overrides: Partial<SmartClass> = {}): SmartClass {
    return {
      id: "cls-1",
      name: "A",
      student_count: 0,
      assignment_count: 0,
      completion_rate: 0,
      created_at: "2025-01-01",
      ...overrides,
    };
  }

  it("CMP-05: returns 'Chưa đặt lịch' when both dates absent", () => {
    expect(classDateRange(makeClass())).toBe("Chưa đặt lịch");
  });

  it("CMP-05: formats a start–end range", () => {
    const result = classDateRange(makeClass({ start_date: "2025-01-01", end_date: "2025-06-30" }));
    expect(result).toBe("01/01/2025 – 30/06/2025");
  });

  it("CMP-05: handles missing end_date (shows --/--/----)", () => {
    const result = classDateRange(makeClass({ start_date: "2025-01-01" }));
    expect(result).toContain("01/01/2025");
    expect(result).toContain("--/--/----");
  });
});

// ── studentLabel ─────────────────────────────────────────────────────────────

describe("studentLabel", () => {
  function makeClass(overrides: Partial<SmartClass> = {}): SmartClass {
    return {
      id: "c",
      name: "C",
      student_count: 0,
      assignment_count: 0,
      completion_rate: 0,
      created_at: "2025-01-01",
      ...overrides,
    };
  }

  it("includes capacity when set", () => {
    expect(studentLabel(makeClass({ student_count: 3, capacity: 10 }))).toBe("3/10 học viên");
  });

  it("omits capacity when not set", () => {
    expect(studentLabel(makeClass({ student_count: 5 }))).toBe("5 học viên");
  });
});

// ── progressClass ─────────────────────────────────────────────────────────────

describe("progressClass", () => {
  it("returns emerald for >= 80", () => {
    expect(progressClass(80)).toBe("bg-emerald-500");
    expect(progressClass(100)).toBe("bg-emerald-500");
  });

  it("returns amber for >= 60 but < 80", () => {
    expect(progressClass(60)).toBe("bg-amber-400");
    expect(progressClass(79)).toBe("bg-amber-400");
  });

  it("returns brand for < 60", () => {
    expect(progressClass(0)).toBe("bg-brand-500");
    expect(progressClass(59)).toBe("bg-brand-500");
  });
});

// ── levelBadgeClass ───────────────────────────────────────────────────────────

describe("levelBadgeClass (class-format)", () => {
  it("returns violet styles for level containing '7'", () => {
    const cls = levelBadgeClass("Band 7.0");
    expect(cls).toContain("violet");
  });

  it("returns amber styles for level containing '5.5'", () => {
    const cls = levelBadgeClass("Band 5.5");
    expect(cls).toContain("amber");
  });

  it("returns emerald styles for giao tiếp", () => {
    const cls = levelBadgeClass("Giao tiếp");
    expect(cls).toContain("emerald");
  });

  it("returns ink styles for Foundation", () => {
    const cls = levelBadgeClass("Foundation");
    expect(cls).toContain("ink");
  });

  it("returns sky/brand styles for other band strings", () => {
    const cls = levelBadgeClass("Band 6.0");
    expect(cls).toContain("sky");
  });

  it("returns ink/500 styles when level is undefined", () => {
    const cls = levelBadgeClass(undefined);
    expect(cls).toContain("ink");
    expect(cls).toContain("200"); // border-ink-200
  });
});

// ── fmtMs — SHELL-05 ─────────────────────────────────────────────────────────

describe("fmtMs — SHELL-05", () => {
  it("SHELL-05: < 60 000ms → seconds only", () => {
    expect(fmtMs(5000)).toBe("5s");
  });

  it("SHELL-05: exactly 60 000ms → 1p (no seconds)", () => {
    expect(fmtMs(60_000)).toBe("1p");
  });

  it("SHELL-05: 90 000ms → 1p 30s", () => {
    expect(fmtMs(90_000)).toBe("1p 30s");
  });

  it("SHELL-05: 120 000ms → 2p (no seconds)", () => {
    expect(fmtMs(120_000)).toBe("2p");
  });

  it("SHELL-05: 125 000ms → 2p 5s", () => {
    expect(fmtMs(125_000)).toBe("2p 5s");
  });

  it("SHELL-05: sub-second rounds to nearest second", () => {
    expect(fmtMs(500)).toBe("1s");
    expect(fmtMs(400)).toBe("0s");
  });
});

// ── dayLabel ──────────────────────────────────────────────────────────────────

describe("dayLabel", () => {
  it("returns MM-DD slice from YYYY-MM-DD", () => {
    expect(dayLabel("2025-06-29")).toBe("06-29");
  });

  it("works for early months", () => {
    expect(dayLabel("2025-01-05")).toBe("01-05");
  });
});

// ── completionFromDaily ───────────────────────────────────────────────────────

describe("completionFromDaily", () => {
  it("returns zeros when daily array is empty", () => {
    const r = completionFromDaily([]);
    expect(r.total).toBe(0);
    expect(r.donePct).toBe(0);
    expect(r.segments[0].value).toBe(0); // Submitted
    expect(r.segments[1].value).toBe(0); // In progress
    expect(r.segments[2].value).toBe(0); // Overdue
  });

  it("aggregates submitted / pending / overdue across multiple days", () => {
    const daily = [
      { day: "2025-06-01", submitted: 10, pending: 3, overdue: 2 },
      { day: "2025-06-02", submitted: 5, pending: 1, overdue: 0 },
    ];
    const r = completionFromDaily(daily);
    expect(r.total).toBe(21);
    expect(r.segments.find((s) => s.label === "Đã nộp")!.value).toBe(15);
    expect(r.segments.find((s) => s.label === "Đang làm")!.value).toBe(4);
    expect(r.segments.find((s) => s.label === "Quá hạn")!.value).toBe(2);
  });

  it("calculates donePct as percentage of total (rounded)", () => {
    const daily = [{ day: "2025-06-01", submitted: 1, pending: 1, overdue: 0 }];
    const r = completionFromDaily(daily);
    expect(r.donePct).toBe(50);
  });

  it("donePct is 100 when all submitted", () => {
    const daily = [{ day: "2025-06-01", submitted: 5, pending: 0, overdue: 0 }];
    expect(completionFromDaily(daily).donePct).toBe(100);
  });

  it("donePct is 0 when none submitted", () => {
    const daily = [{ day: "2025-06-01", submitted: 0, pending: 3, overdue: 2 }];
    expect(completionFromDaily(daily).donePct).toBe(0);
  });
});
