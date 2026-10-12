import { describe, it, expect } from "vitest";
import { sortComparator } from "@/features/assignments/assignment-sort";
import { deadlineBadge, deadlineLabel, isOverdue, isDueSoon } from "@/features/assignments/deadline";

const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString();

describe("sortComparator", () => {
  it("orders newest first by created_at", () => {
    const items = [
      { createdAt: iso(-5) },
      { createdAt: iso(-1) },
      { createdAt: iso(-3) },
    ];
    const sorted = [...items].sort(sortComparator("newest"));
    expect(sorted.map((i) => i.createdAt)).toEqual([items[1].createdAt, items[2].createdAt, items[0].createdAt]);
  });

  it("pushes assignments with no deadline to the end", () => {
    const items = [
      { createdAt: iso(-1), deadline: undefined },
      { createdAt: iso(-2), deadline: iso(10) },
      { createdAt: iso(-3), deadline: iso(2) },
    ];
    const sorted = [...items].sort(sortComparator("deadline"));
    expect(sorted.map((i) => i.deadline)).toEqual([items[2].deadline, items[1].deadline, undefined]);
  });

  it("orders by pendingReview descending", () => {
    const items = [
      { createdAt: iso(-1), pendingReview: 2 },
      { createdAt: iso(-2), pendingReview: 9 },
      { createdAt: iso(-3), pendingReview: 0 },
    ];
    const sorted = [...items].sort(sortComparator("needReview"));
    expect(sorted.map((i) => i.pendingReview)).toEqual([9, 2, 0]);
  });

  it("ranks lowest submit by ratio, not by absolute count", () => {
    const items = [
      { createdAt: iso(-1), submitted: 12, total: 15 },
      { createdAt: iso(-2), submitted: 2, total: 2 },
      { createdAt: iso(-3), submitted: 1, total: 20 },
    ];
    const sorted = [...items].sort(sortComparator("lowestSubmit"));
    expect(sorted.map((i) => i.submitted)).toEqual([1, 12, 2]);
  });
});

describe("deadlineBadge", () => {
  it("flags an overdue deadline with the error tone", () => {
    expect(deadlineBadge(iso(-1))).toEqual({ label: "Quá hạn", tone: "error" });
  });

  it("warns when a single day is left", () => {
    const badge = deadlineBadge(iso(0.5));
    expect(badge).toEqual({ label: "Còn 1 ngày", tone: "warning" });
  });

  it("warns when two days are left", () => {
    expect(deadlineBadge(iso(1.5))?.tone).toBe("warning");
  });

  it("stays neutral when there is plenty of time", () => {
    expect(deadlineBadge(iso(10))?.tone).toBe("gray");
  });

  it("returns null when there is no deadline", () => {
    expect(deadlineBadge(undefined)).toBeNull();
  });
});

describe("deadlineLabel", () => {
  it("always renders something, even with no deadline", () => {
    expect(deadlineLabel(undefined)).toEqual({ label: "Không hạn", tone: "gray" });
  });

  it("matches deadlineBadge when a deadline exists", () => {
    const d = iso(-2);
    expect(deadlineLabel(d)).toEqual(deadlineBadge(d));
  });
});

describe("isOverdue / isDueSoon", () => {
  it("detects an overdue deadline", () => {
    expect(isOverdue(iso(-1))).toBe(true);
    expect(isOverdue(iso(1))).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });

  it("detects work due within the window but not work already overdue", () => {
    expect(isDueSoon(iso(1))).toBe(true);
    expect(isDueSoon(iso(10))).toBe(false);
    expect(isDueSoon(iso(-1))).toBe(false);
    expect(isDueSoon(undefined)).toBe(false);
  });
});
