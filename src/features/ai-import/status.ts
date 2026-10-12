import type { BadgeProps } from "@/components/ui/badge";
import type { AIImportStatus } from "./types";

export const STATUS_LABEL: Record<AIImportStatus, string> = {
  queued: "Đang chờ",
  classifying: "Đang nhận diện file",
  awaiting_confirm: "Chờ xác nhận nhận diện",
  extracting: "Đang đọc đề",
  generating: "Đang soạn câu hỏi",
  validating: "Đang kiểm tra",
  ready_for_review: "Chờ rà soát",
  importing: "Đang tạo đề",
  done: "Đã tạo đề",
  failed: "Thất bại",
};

export const STATUS_TONE: Record<AIImportStatus, NonNullable<BadgeProps["tone"]>> = {
  queued: "gray",
  classifying: "info",
  awaiting_confirm: "warning",
  extracting: "info",
  generating: "info",
  validating: "info",
  ready_for_review: "warning",
  importing: "info",
  done: "success",
  failed: "error",
};

// awaiting_confirm belongs here even though the job is unfinished: nothing but a person moves it,
// so polling it would just burn requests.
const SETTLED: readonly AIImportStatus[] = [
  "awaiting_confirm",
  "ready_for_review",
  "done",
  "failed",
];

/** A job the worker can still move on its own — the only state worth polling for. */
export function isRunning(status: AIImportStatus): boolean {
  return !SETTLED.includes(status);
}

// awaiting_confirm belongs here: the review screen is where the reviewer confirms what each file
// is, and confirming is the only thing that releases the build phase. Leave it out and the job
// parks forever with no control anywhere on screen.
const ON_REVIEW_SCREEN: readonly AIImportStatus[] = ["awaiting_confirm", "ready_for_review", "done"];

/** Statuses the review screen renders, rather than the progress card. */
export function showsReviewScreen(status: AIImportStatus): boolean {
  return ON_REVIEW_SCREEN.includes(status);
}
