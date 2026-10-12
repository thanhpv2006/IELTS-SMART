import type { BadgeProps } from "@/components/ui/badge";

type Tone = NonNullable<BadgeProps["tone"]>;

export const SKILL_LABEL: Record<string, string> = {
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
  speaking: "Speaking",
};

// brand is reserved for the full test, so reading takes info.
export const SKILL_TONE: Record<string, Tone> = {
  reading: "info",
  listening: "purple",
  writing: "warning",
  speaking: "success",
};

export const FULL_TEST_LABEL = "Full test";
const FULL_TEST_TONE: Tone = "brand";

export const tierLabel = (tier?: string): string =>
  tier === "exam" ? "Đề thi (cũ)" : tier === "homework" ? "BTVN (cũ)" : "Luyện tập";

type SkillCarrier = { skill?: string; purpose?: string };

export function skillLabelOf(a: SkillCarrier): string | null {
  if (a.purpose === "mock") return FULL_TEST_LABEL;
  if (!a.skill) return null;
  return SKILL_LABEL[a.skill] ?? a.skill;
}

export function skillToneOf(a: SkillCarrier): Tone {
  if (a.purpose === "mock") return FULL_TEST_TONE;
  return (a.skill && SKILL_TONE[a.skill]) || "gray";
}

// submitted and scored both read as "waiting for a result" to the student, so
// they share one label.
export const STATUS_LABEL: Record<string, string> = {
  pending: "Chưa làm",
  submitted: "Đang chấm",
  scored: "Đang chấm",
  reviewed: "Đã review",
  released: "Có kết quả",
  failed: "Lỗi",
};

export const STATUS_TONE: Record<string, Tone> = {
  pending: "warning",
  submitted: "purple",
  scored: "purple",
  reviewed: "brand",
  released: "success",
  failed: "error",
};

export const statusLabelOf = (status: string): string => STATUS_LABEL[status] ?? status;
export const statusToneOf = (status: string): Tone => STATUS_TONE[status] ?? "gray";

export const MANUAL_GRADING_LABEL = "Hết lượt chấm AI";
export const MANUAL_GRADING_STUDENT_LABEL = "Hết lượt chấm AI · chờ giáo viên chấm";

const MANUAL_GRADING_STATUSES = new Set(["submitted", "scored", "reviewed"]);

type StudentStatusCarrier = { status: string; grading_mode?: string };

export function studentStatusLabelOf(a: StudentStatusCarrier): { label: string; tone: Tone } {
  if (a.grading_mode === "manual" && MANUAL_GRADING_STATUSES.has(a.status)) {
    return { label: MANUAL_GRADING_STUDENT_LABEL, tone: "warning" };
  }
  return { label: statusLabelOf(a.status), tone: statusToneOf(a.status) };
}
