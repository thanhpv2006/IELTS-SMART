import { describe, it, expect } from "vitest";
import { studentStatusLabelOf, MANUAL_GRADING_LABEL, statusLabelOf, statusToneOf } from "./assignment-format";

describe("studentStatusLabelOf", () => {
  it("shows the manual-grading status when scored and manual", () => {
    expect(studentStatusLabelOf({ status: "scored", grading_mode: "manual" })).toEqual({
      label: "Hết lượt chấm AI · chờ giáo viên chấm",
      tone: "warning",
    });
  });

  it("shows the manual-grading status when submitted and manual", () => {
    expect(studentStatusLabelOf({ status: "submitted", grading_mode: "manual" })).toEqual({
      label: "Hết lượt chấm AI · chờ giáo viên chấm",
      tone: "warning",
    });
  });

  it("falls back to the normal released label once a manual result is released", () => {
    expect(studentStatusLabelOf({ status: "released", grading_mode: "manual" })).toEqual({
      label: statusLabelOf("released"),
      tone: statusToneOf("released"),
    });
  });

  it("uses the normal status label when grading_mode is absent", () => {
    expect(studentStatusLabelOf({ status: "scored" })).toEqual({
      label: statusLabelOf("scored"),
      tone: statusToneOf("scored"),
    });
  });
});

describe("MANUAL_GRADING_LABEL", () => {
  it("is the teacher-facing tag string", () => {
    expect(MANUAL_GRADING_LABEL).toBe("Hết lượt chấm AI");
  });
});
