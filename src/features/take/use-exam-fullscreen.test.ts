import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { useExamFullscreen, useExitFullscreenAfterExam } from "@/features/take/use-exam-fullscreen";

// jsdom has no Fullscreen API — stub `document.fullscreenElement` as a test-controlled
// getter and mock `requestFullscreen` so the hook's enter/exit flow can be driven manually.
let currentEl: Element | null = null;

beforeEach(() => {
  currentEl = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => currentEl,
  });
  document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
  document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fullscreenElement");
});

describe("useExamFullscreen", () => {
  it("resolves to ready when disabled", () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useExamFullscreen(false, onExit));

    expect(result.current.phase).toBe("ready");
  });

  it("starts on the start-gate when enabled and not fullscreen", () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useExamFullscreen(true, onExit));

    expect(result.current.phase).toBe("start-gate");
  });

  it("moves to ready after requestFullscreen resolves and fullscreenchange fires", async () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useExamFullscreen(true, onExit));

    await act(async () => {
      result.current.requestFullscreen();
      await Promise.resolve();
    });

    act(() => {
      currentEl = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.phase).toBe("ready");
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it("moves to resume-gate and fires onExit once after leaving fullscreen", async () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useExamFullscreen(true, onExit));

    await act(async () => {
      result.current.requestFullscreen();
      await Promise.resolve();
    });
    act(() => {
      currentEl = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.phase).toBe("ready");

    act(() => {
      currentEl = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.phase).toBe("resume-gate");
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("seeds ready immediately when already fullscreen at mount (mock skill remount) without a spurious onExit", () => {
    currentEl = document.documentElement;
    const onExit = vi.fn();
    const { result } = renderHook(() => useExamFullscreen(true, onExit));

    expect(result.current.phase).toBe("ready");
    expect(onExit).not.toHaveBeenCalled();
  });

  it("degrades to ready without gating or throwing when the Fullscreen API is unsupported (e.g. iOS Safari)", () => {
    // Simulate a browser with no element Fullscreen API: the member is not a function.
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    (document.documentElement as unknown as { requestFullscreen?: unknown }).requestFullscreen =
      undefined;
    const onExit = vi.fn();
    const { result } = renderHook(() => useExamFullscreen(true, onExit));

    // GC7: no gate is shown (would hard-block the exam), and invoking the enter action must not throw.
    expect(result.current.phase).toBe("ready");
    expect(() => act(() => result.current.requestFullscreen())).not.toThrow();
    expect(result.current.phase).toBe("ready");
  });
});

describe("useExitFullscreenAfterExam", () => {
  it("leaves fullscreen once the exam is done", () => {
    currentEl = document.documentElement;
    const { rerender } = renderHook(({ done }) => useExitFullscreenAfterExam(done), {
      initialProps: { done: false },
    });
    expect(document.exitFullscreen).not.toHaveBeenCalled();

    rerender({ done: true });

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("leaves fullscreen when the exam page unmounts", () => {
    currentEl = document.documentElement;
    const { unmount } = renderHook(() => useExitFullscreenAfterExam(false));

    unmount();

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the browser is not fullscreen", () => {
    const { rerender, unmount } = renderHook(({ done }) => useExitFullscreenAfterExam(done), {
      initialProps: { done: false },
    });

    rerender({ done: true });
    unmount();

    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });
});
