import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { studentAssignmentApi } from "@/features/student/api";
import { useViolationReporter } from "@/features/take/use-violation-reporter";

vi.mock("@/features/student/api", () => ({
  studentAssignmentApi: {
    reportViolations: vi.fn(),
  },
}));

const reportViolations = vi.mocked(studentAssignmentApi.reportViolations);

beforeEach(() => {
  vi.useFakeTimers();
  reportViolations.mockReset();
  reportViolations.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useViolationReporter", () => {
  it("is a no-op when disabled, even after the flush window elapses", () => {
    const { result } = renderHook(() => useViolationReporter("a1", false));

    act(() => {
      result.current({ type: "blur" });
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(reportViolations).not.toHaveBeenCalled();
  });

  it("batches events within the 5s window into a single call", () => {
    const { result } = renderHook(() => useViolationReporter("a1", true));

    act(() => {
      result.current({ type: "blur" });
      result.current({ type: "leave-tab" });
      result.current({ type: "copy" });
    });

    expect(reportViolations).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(reportViolations).toHaveBeenCalledTimes(1);
    const [assignmentId, events] = reportViolations.mock.calls[0]!;
    expect(assignmentId).toBe("a1");
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(["blur", "leave-tab", "copy"]);
  });

  it("flushes immediately when the document becomes hidden", () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    const { result } = renderHook(() => useViolationReporter("a1", true));

    act(() => {
      result.current({ type: "blur" });
    });

    expect(reportViolations).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(reportViolations).toHaveBeenCalledTimes(1);

    // The pending 5s timer for that batch must not double-flush an empty buffer as an error.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(reportViolations).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
  });

  it("swallows a rejected reportViolations call without throwing out of the flush", async () => {
    reportViolations.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useViolationReporter("a1", true));

    act(() => {
      result.current({ type: "blur" });
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      // Let the rejected promise's .catch() microtask settle.
      await Promise.resolve();
    });

    expect(reportViolations).toHaveBeenCalledTimes(1);
  });
});
