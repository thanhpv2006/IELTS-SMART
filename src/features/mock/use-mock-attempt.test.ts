import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SubmitPayload } from "@novaforge-team/ielts-exam-engine";

import { mockApi } from "@/features/mock/api";
import { catalogSetApi } from "@/features/take/api";
import { useMockAttempt } from "@/features/mock/use-mock-attempt";
import type { MockAttempt } from "@/features/mock/types";
import { ApiError } from "@/lib/api/errors";

vi.mock("@/features/mock/api", () => ({
  mockApi: {
    startMock: vi.fn(),
    submitObjectiveSkill: vi.fn(),
    submitScoredSkill: vi.fn(),
  },
}));
vi.mock("@/features/take/api", () => ({
  catalogSetApi: { get: vi.fn() },
}));

const startMock = vi.mocked(mockApi.startMock);
const submitObjectiveSkill = vi.mocked(mockApi.submitObjectiveSkill);
const submitScoredSkill = vi.mocked(mockApi.submitScoredSkill);
const catalogGet = vi.mocked(catalogSetApi.get);

// Speaking + Listening done, Reading + Writing still not_started — the exact state at a
// violation during Listening (Speaking→Listening completed, later skills pending).
const ATTEMPT: MockAttempt = {
  attempt_id: "at1",
  set_id: "set1",
  variant: "academic",
  status: "in_progress",
  reveal_mode: "at_end",
  skills: [
    { skill: "speaking", status: "completed" },
    { skill: "listening", status: "completed" },
    { skill: "reading", status: "not_started" },
    { skill: "writing", status: "not_started" },
  ],
};

const SPEAKING_NOT_STARTED: MockAttempt = {
  ...ATTEMPT,
  skills: [
    { skill: "speaking", status: "not_started" },
    { skill: "listening", status: "completed" },
    { skill: "reading", status: "not_started" },
    { skill: "writing", status: "not_started" },
  ],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  startMock.mockReset().mockResolvedValue(ATTEMPT);
  catalogGet.mockReset().mockResolvedValue({ id: "set1", items: [] } as never);
  submitObjectiveSkill.mockReset();
  submitScoredSkill.mockReset();
});

describe("useMockAttempt.forfeitRemaining — resilient forfeit (lock bug regression)", () => {
  it("keeps forfeiting remaining skills even when one skill's submit rejects", async () => {
    // Reading (objective) rejects — mirrors the historical 409 on a stale re-submit.
    submitObjectiveSkill.mockRejectedValue(new Error("409 skill_already_scored"));
    submitScoredSkill.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMockAttempt("a1"), { wrapper });
    await waitFor(() => expect(result.current.attempt).toBeTruthy());

    // Must NOT throw despite the reading rejection.
    await act(async () => {
      await result.current.forfeitRemaining();
    });

    // Reading was attempted (and rejected) ...
    expect(submitObjectiveSkill).toHaveBeenCalledWith("at1", "reading", []);
    // ... and Writing STILL got forfeited (loop did not abort on reading's error).
    expect(submitScoredSkill).toHaveBeenCalledWith("at1", "writing", []);
  });

  it("skips skills that are not not_started", async () => {
    submitObjectiveSkill.mockResolvedValue(undefined);
    submitScoredSkill.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMockAttempt("a1"), { wrapper });
    await waitFor(() => expect(result.current.attempt).toBeTruthy());

    await act(async () => {
      await result.current.forfeitRemaining();
    });

    // Speaking + Listening already completed → never re-submitted.
    expect(submitScoredSkill).not.toHaveBeenCalledWith("at1", "speaking", []);
    expect(submitObjectiveSkill).not.toHaveBeenCalledWith("at1", "listening", []);
    // Only the two not_started skills are forfeited.
    expect(submitObjectiveSkill).toHaveBeenCalledWith("at1", "reading", []);
    expect(submitScoredSkill).toHaveBeenCalledWith("at1", "writing", []);
  });
});

describe("useMockAttempt.submitSkill — voice-sample passthrough", () => {
  it("forwards voiceSample as the 4th arg for speaking", async () => {
    startMock.mockResolvedValue(SPEAKING_NOT_STARTED);
    submitScoredSkill.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMockAttempt("a1"), { wrapper });
    await waitFor(() => expect(result.current.attempt).toBeTruthy());

    const payload: SubmitPayload = {
      skill: "speaking",
      responses: [{ question_id: "q0", audio_key: "partner-media/u/audio/a0.webm" }],
    };

    await act(async () => {
      await result.current.submitSkill("speaking", payload, {
        voiceSample: "partner-media/u/audio/vs.webm",
      });
    });

    expect(submitScoredSkill).toHaveBeenCalledWith(
      "at1",
      "speaking",
      [{ question_id: "q0", audio_url: "partner-media/u/audio/a0.webm", essay_text: undefined }],
      "partner-media/u/audio/vs.webm",
    );
  });

  it("forces the 4th arg to null for non-speaking skills", async () => {
    startMock.mockResolvedValue(ATTEMPT);
    submitScoredSkill.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMockAttempt("a1"), { wrapper });
    await waitFor(() => expect(result.current.attempt).toBeTruthy());

    const payload: SubmitPayload = {
      skill: "writing",
      responses: [{ question_id: "q0", essay_text: "some essay" }],
    };

    await act(async () => {
      await result.current.submitSkill("writing", payload, { voiceSample: "partner-media/u/audio/vs.webm" });
    });

    expect(submitScoredSkill).toHaveBeenCalledWith(
      "at1",
      "writing",
      [{ question_id: "q0", audio_url: undefined, essay_text: "some essay" }],
      null,
    );
  });
});

describe("useMockAttempt.submitSkill — invalid_json retry (deploy-order safety net)", () => {
  it("retries once without the voice sample when the backend rejects the unknown field", async () => {
    startMock.mockResolvedValue(SPEAKING_NOT_STARTED);
    submitScoredSkill
      .mockRejectedValueOnce(new ApiError(400, { code: "invalid_json", message: "invalid_json" }))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useMockAttempt("a1"), { wrapper });
    await waitFor(() => expect(result.current.attempt).toBeTruthy());

    const payload: SubmitPayload = {
      skill: "speaking",
      responses: [{ question_id: "q0", audio_key: "partner-media/u/audio/a0.webm" }],
    };

    await act(async () => {
      await result.current.submitSkill("speaking", payload, {
        voiceSample: "partner-media/u/audio/vs.webm",
      });
    });

    expect(submitScoredSkill).toHaveBeenCalledTimes(2);
    expect(submitScoredSkill).toHaveBeenNthCalledWith(
      1,
      "at1",
      "speaking",
      [{ question_id: "q0", audio_url: "partner-media/u/audio/a0.webm", essay_text: undefined }],
      "partner-media/u/audio/vs.webm",
    );
    expect(submitScoredSkill).toHaveBeenNthCalledWith(
      2,
      "at1",
      "speaking",
      [{ question_id: "q0", audio_url: "partner-media/u/audio/a0.webm", essay_text: undefined }],
    );
  });

  it("propagates a different error unchanged, with no retry", async () => {
    startMock.mockResolvedValue(SPEAKING_NOT_STARTED);
    submitScoredSkill.mockRejectedValue(new ApiError(500, { code: "internal", message: "internal" }));

    const { result } = renderHook(() => useMockAttempt("a1"), { wrapper });
    await waitFor(() => expect(result.current.attempt).toBeTruthy());

    const payload: SubmitPayload = {
      skill: "speaking",
      responses: [{ question_id: "q0", audio_key: "partner-media/u/audio/a0.webm" }],
    };

    await expect(
      result.current.submitSkill("speaking", payload, {
        voiceSample: "partner-media/u/audio/vs.webm",
      }),
    ).rejects.toThrow("internal");

    expect(submitScoredSkill).toHaveBeenCalledTimes(1);
  });
});
