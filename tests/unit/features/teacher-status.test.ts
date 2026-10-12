/**
 * Unit tests for teacherStatus(), normalizedSpecialization(), and specializationMeta()
 * Source: src/app/(partner)/teachers/page.tsx
 *
 * Case IDs:
 *   TCH-17 — teacherStatus badge (Đang dạy / Tạm nghỉ)
 *   TCH-18 — normalizedSpecialization logic
 *   TCH-19 — specializationMeta label/tone mapping
 */
import { describe, it, expect } from "vitest";
import { teacherStatus, normalizedSpecialization, specializationMeta } from "@/app/(partner)/teachers/page";
import type { Teacher } from "@/features/partner/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Teacher fixture; caller overrides what matters for each test. */
function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    user_id: "t-1",
    display_name: "Test Teacher",
    email: "teacher@test.com",
    status: undefined,
    specializations: [],
    student_count: 0,
    assignments_this_month: 0,
    submission_rate: 0,
    last_active_at: undefined,
    ...overrides,
  };
}

// ── teacherStatus — TCH-17 ────────────────────────────────────────────────────

describe("teacherStatus — TCH-17", () => {
  it("TCH-17: status=active → Đang dạy / tone success", () => {
    const result = teacherStatus(makeTeacher({ status: "active" }));
    expect(result.label).toBe("Đang dạy");
    expect(result.tone).toBe("success");
  });

  it("TCH-17: status=inactive → Tạm nghỉ / tone gray", () => {
    const result = teacherStatus(makeTeacher({ status: "inactive" }));
    expect(result.label).toBe("Tạm nghỉ");
    expect(result.tone).toBe("gray");
  });

  it("TCH-17: no status, no last_active, 0 students, 0 assignments → Tạm nghỉ", () => {
    const result = teacherStatus(
      makeTeacher({ status: undefined, last_active_at: undefined, student_count: 0, assignments_this_month: 0 }),
    );
    expect(result.label).toBe("Tạm nghỉ");
    expect(result.tone).toBe("gray");
  });

  it("TCH-17: no status, no last_active_at but has students → Đang dạy", () => {
    const result = teacherStatus(
      makeTeacher({ status: undefined, last_active_at: undefined, student_count: 5, assignments_this_month: 0 }),
    );
    expect(result.label).toBe("Đang dạy");
    expect(result.tone).toBe("success");
  });

  it("TCH-17: no status, no last_active_at but has assignments → Đang dạy", () => {
    const result = teacherStatus(
      makeTeacher({ status: undefined, last_active_at: undefined, student_count: 0, assignments_this_month: 3 }),
    );
    expect(result.label).toBe("Đang dạy");
    expect(result.tone).toBe("success");
  });

  it("TCH-17: last_active < 60 days ago → Đang dạy", () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = teacherStatus(makeTeacher({ status: undefined, last_active_at: recent }));
    expect(result.label).toBe("Đang dạy");
    expect(result.tone).toBe("success");
  });

  it("TCH-17: last_active > 60 days ago → Tạm nghỉ", () => {
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const result = teacherStatus(makeTeacher({ status: undefined, last_active_at: old }));
    expect(result.label).toBe("Tạm nghỉ");
    expect(result.tone).toBe("gray");
  });

  it("TCH-17: last_active exactly today (0 days) → Đang dạy", () => {
    const result = teacherStatus(makeTeacher({ status: undefined, last_active_at: new Date().toISOString() }));
    expect(result.label).toBe("Đang dạy");
    expect(result.tone).toBe("success");
  });

  // status field takes priority over heuristic
  it("TCH-17: status=inactive overrides heuristic even when recently active", () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    const result = teacherStatus(makeTeacher({ status: "inactive", last_active_at: recent, student_count: 10 }));
    expect(result.label).toBe("Tạm nghỉ");
  });

  it("TCH-17: status=active overrides heuristic even when last_active > 60 days", () => {
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const result = teacherStatus(makeTeacher({ status: "active", last_active_at: old }));
    expect(result.label).toBe("Đang dạy");
  });
});

// ── normalizedSpecialization — TCH-18 ─────────────────────────────────────────

describe("normalizedSpecialization — TCH-18", () => {
  it("TCH-18: speaking only → speaking", () => {
    expect(normalizedSpecialization(makeTeacher({ specializations: ["speaking"] }))).toBe("speaking");
  });

  it("TCH-18: writing only → writing", () => {
    expect(normalizedSpecialization(makeTeacher({ specializations: ["writing"] }))).toBe("writing");
  });

  it("TCH-18: speaking + writing → general", () => {
    expect(normalizedSpecialization(makeTeacher({ specializations: ["speaking", "writing"] }))).toBe("general");
  });

  it("TCH-18: general tag → general", () => {
    expect(normalizedSpecialization(makeTeacher({ specializations: ["general"] }))).toBe("general");
  });

  it("TCH-18: empty array → unknown", () => {
    expect(normalizedSpecialization(makeTeacher({ specializations: [] }))).toBe("unknown");
  });

  it("TCH-18: undefined specializations → unknown", () => {
    expect(normalizedSpecialization(makeTeacher({ specializations: undefined }))).toBe("unknown");
  });

  it("TCH-18: general tag takes priority even when speaking is present", () => {
    expect(normalizedSpecialization(makeTeacher({ specializations: ["general", "speaking"] }))).toBe("general");
  });
});

// ── specializationMeta — TCH-19 ───────────────────────────────────────────────

describe("specializationMeta — TCH-19", () => {
  it("TCH-19: speaking → label=Speaking tone=success", () => {
    const m = specializationMeta("speaking");
    expect(m.label).toBe("Speaking");
    expect(m.tone).toBe("success");
  });

  it("TCH-19: writing → label=Writing tone=warning", () => {
    const m = specializationMeta("writing");
    expect(m.label).toBe("Writing");
    expect(m.tone).toBe("warning");
  });

  it("TCH-19: general → label=IELTS tổng quát tone=info", () => {
    const m = specializationMeta("general");
    expect(m.label).toBe("IELTS tổng quát");
    expect(m.tone).toBe("info");
  });

  it("TCH-19: unknown → label=Chưa cập nhật tone=gray", () => {
    const m = specializationMeta("unknown");
    expect(m.label).toBe("Chưa cập nhật");
    expect(m.tone).toBe("gray");
  });

  it("TCH-19: arbitrary unrecognized string → label=Chưa cập nhật tone=gray", () => {
    const m = specializationMeta("math");
    expect(m.label).toBe("Chưa cập nhật");
    expect(m.tone).toBe("gray");
  });
});
