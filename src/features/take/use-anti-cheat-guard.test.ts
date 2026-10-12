import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { studentAssignmentApi } from "@/features/student/api";
import { useAntiCheatGuard } from "@/features/take/use-anti-cheat-guard";

// useAntiCheatGuard calls useViolationReporter internally, which forwards to
// studentAssignmentApi.reportViolations — mock at that boundary (mirrors
// use-violation-reporter.test.ts) instead of mocking the hook itself, so the real
// batching/strike logic under test stays intact.
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

function setup(onTerminate = vi.fn()) {
  const { result } = renderHook(() => useAntiCheatGuard("a1", true, { onTerminate }));
  return { result, onTerminate };
}

describe("useAntiCheatGuard — leave-tab (own 2-strike counter)", () => {
  it("1st leave-tab opens the tab gate, does not terminate", () => {
    const { result, onTerminate } = setup();

    act(() => {
      result.current.report({ type: "leave-tab" });
    });

    expect(result.current.tabGateOpen).toBe(true);
    expect(onTerminate).not.toHaveBeenCalled();
  });

  it("2nd leave-tab terminates once and closes the tab gate", () => {
    const { result, onTerminate } = setup();

    act(() => {
      result.current.report({ type: "leave-tab" });
    });
    expect(result.current.tabGateOpen).toBe(true);

    act(() => {
      result.current.report({ type: "leave-tab" });
    });

    expect(onTerminate).toHaveBeenCalledTimes(1);
    expect(result.current.tabGateOpen).toBe(false);
  });

  it("onTerminate fires exactly once even on a 3rd and 4th leave-tab", () => {
    const { result, onTerminate } = setup();

    act(() => {
      result.current.report({ type: "leave-tab" }); // strike 1: gate
      result.current.report({ type: "leave-tab" }); // strike 2: terminate
      result.current.report({ type: "leave-tab" }); // strike 3: no-op
      result.current.report({ type: "leave-tab" }); // strike 4: no-op
    });

    expect(onTerminate).toHaveBeenCalledTimes(1);
  });

  it("acknowledgeTab closes the strike-1 gate without terminating", () => {
    const { result, onTerminate } = setup();

    act(() => {
      result.current.report({ type: "leave-tab" });
    });
    expect(result.current.tabGateOpen).toBe(true);

    act(() => {
      result.current.acknowledgeTab();
    });

    expect(result.current.tabGateOpen).toBe(false);
    expect(onTerminate).not.toHaveBeenCalled();
  });
});

describe("useAntiCheatGuard — exit-fullscreen (own 2-strike counter)", () => {
  it("1st exit-fullscreen does not terminate and does not open the tab gate", () => {
    const { result, onTerminate } = setup();

    act(() => {
      result.current.report({ type: "exit-fullscreen" });
    });

    // Strike 1 is handled by the fullscreen resume-gate (useExamFullscreen), not the tab gate.
    expect(result.current.tabGateOpen).toBe(false);
    expect(onTerminate).not.toHaveBeenCalled();
  });

  it("2nd exit-fullscreen terminates exactly once", () => {
    const { result, onTerminate } = setup();

    act(() => {
      result.current.report({ type: "exit-fullscreen" });
      result.current.report({ type: "exit-fullscreen" });
      result.current.report({ type: "exit-fullscreen" }); // no-op after terminate
    });

    expect(onTerminate).toHaveBeenCalledTimes(1);
  });

  it("keeps counters independent — one leave-tab + one exit-fullscreen does NOT terminate", () => {
    const { result, onTerminate } = setup();

    act(() => {
      result.current.report({ type: "leave-tab" }); // tab strike 1
      result.current.report({ type: "exit-fullscreen" }); // fs strike 1
    });

    expect(onTerminate).not.toHaveBeenCalled();
    expect(result.current.tabGateOpen).toBe(true);
  });
});

describe("useAntiCheatGuard — non-strike events", () => {
  it.each(["blur", "copy", "paste-blocked"])(
    "%s never counts toward strikes (no gate, no terminate) even fired repeatedly",
    (type) => {
      const { result, onTerminate } = setup();

      act(() => {
        result.current.report({ type });
        result.current.report({ type });
        result.current.report({ type });
      });

      expect(result.current.tabGateOpen).toBe(false);
      expect(onTerminate).not.toHaveBeenCalled();
    },
  );

  it("forwards every event (including non-strike types) to the violation reporter", () => {
    const { result } = setup();

    act(() => {
      result.current.report({ type: "blur" });
      result.current.report({ type: "leave-tab" });
      result.current.report({ type: "copy" });
      result.current.report({ type: "paste-blocked" });
      result.current.report({ type: "exit-fullscreen" });
    });

    act(() => {
      vi.advanceTimersByTime(5000); // flush the violation reporter's batch window
    });

    expect(reportViolations).toHaveBeenCalledTimes(1);
    const [assignmentId, events] = reportViolations.mock.calls[0]!;
    expect(assignmentId).toBe("a1");
    expect(events.map((e) => e.type)).toEqual([
      "blur",
      "leave-tab",
      "copy",
      "paste-blocked",
      "exit-fullscreen",
    ]);
  });
});
