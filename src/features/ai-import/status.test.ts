import { describe, expect, it } from "vitest";
import { isRunning, showsReviewScreen, STATUS_LABEL, STATUS_TONE } from "./status";
import type { AIImportStatus } from "./types";

const ALL: AIImportStatus[] = [
  "queued",
  "classifying",
  "awaiting_confirm",
  "extracting",
  "generating",
  "validating",
  "ready_for_review",
  "importing",
  "done",
  "failed",
];

describe("AI import status", () => {
  it("labels every status, so none of them renders as blank", () => {
    for (const status of ALL) {
      expect(STATUS_LABEL[status], status).toBeTruthy();
      expect(STATUS_TONE[status], status).toBeTruthy();
    }
  });

  // The checkpoint is a dead end without this: the review screen holds the only confirm control,
  // and awaiting_confirm is not a status the worker can move on its own.
  it("puts the classification checkpoint on the review screen", () => {
    expect(showsReviewScreen("awaiting_confirm")).toBe(true);
    expect(isRunning("awaiting_confirm")).toBe(false);
  });

  it("keeps the draft states on the review screen", () => {
    expect(showsReviewScreen("ready_for_review")).toBe(true);
    expect(showsReviewScreen("done")).toBe(true);
  });

  it("leaves the states only the worker moves off the review screen", () => {
    for (const status of ["queued", "classifying", "extracting", "generating", "validating"] as const) {
      expect(showsReviewScreen(status), status).toBe(false);
      expect(isRunning(status), status).toBe(true);
    }
  });

  it("does not poll a settled job", () => {
    expect(isRunning("done")).toBe(false);
    expect(isRunning("failed")).toBe(false);
    expect(isRunning("ready_for_review")).toBe(false);
  });
});
