import { createRef, forwardRef, useEffect, useImperativeHandle, type ComponentProps } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture the props the wrapper forwards to the engine SkillRunner. The real component is heavy
// (audio, timers, DOM); we only assert the exam/practice configuration the wrapper applies.
type RunnerProps = ComponentProps<typeof import("@novaforge-team/ielts-exam-engine").SkillRunner>;
type MockRunnerHandle = { submit: () => void };

let lastProps: RunnerProps | null = null;
// Counts how many times the mock SkillRunner MOUNTS (effect with [] deps runs once per mount,
// not per re-render) — used to assert the W1 fix: the engine instance must survive a
// ready -> resume-gate transition instead of being torn down and re-created.
let mountCount = 0;

vi.mock("@novaforge-team/ielts-exam-engine", () => ({
  SkillRunner: forwardRef<MockRunnerHandle, RunnerProps>((props, ref) => {
    lastProps = props;
    useEffect(() => {
      mountCount += 1;
    }, []);
    // Mirrors the real engine's forwardRef + useImperativeHandle submit handle (1.1): calling
    // ref.current.submit() drives the engine's own onSubmit path.
    useImperativeHandle(ref, () => ({
      submit: () => {
        void props.onSubmit({} as never);
      },
    }));
    return null;
  }),
  defaultCopyEn: { __copy: "en" },
}));

import { ExamSkillRunner } from "@/features/take/exam-skill-runner";
import { defaultCopyEn, type SkillRunnerHandle } from "@novaforge-team/ielts-exam-engine";

// No `as const`: it would make `questions: readonly []`, which is not assignable to the wrapper's
// mutable `CatalogQuestion[]` prop. skill/examMode are passed per-render (not from base), so nothing
// here needs literal narrowing.
const base = {
  questions: [],
  draftKey: "a1:reading",
  onUploadAudio: async () => "key",
  onSubmit: () => {},
};

beforeEach(() => {
  lastProps = null;
  mountCount = 0;
});

describe("ExamSkillRunner", () => {
  it("exam mode (reading): exam config + default Vietnamese copy", () => {
    render(<ExamSkillRunner {...base} skill="reading" examMode timeLimitSeconds={3600} />);
    expect(lastProps).not.toBeNull();
    expect(lastProps!.mode).toBe("exam");
    expect(lastProps!.enableHighlighter).toBe(true); // ON in exam mode
    expect(lastProps!.fillHeight).toBe(true);
    expect(lastProps!.timeLimitSeconds).toBe(3600);
    expect(lastProps!.draftKey).toBe("a1:reading");
    expect(lastProps!.copy).toBe(defaultCopyEn); // defaults to defaultCopyEn when no copy prop
    // Exam mode must NOT leak the practice-only speaking passthrough.
    expect(lastProps!.policyOverrides).toBeUndefined();
    expect(lastProps!.speakingTiming).toBeUndefined();
  });

  it("practice mode (speaking): highlighter off, no timer, passthrough props", () => {
    render(
      <ExamSkillRunner
        {...base}
        skill="speaking"
        examMode={false}
        policyOverrides={{ autoRecord: true }}
        speakingTiming={{ gapSeconds: 1 }}
      />,
    );
    expect(lastProps!.mode).toBe("practice");
    expect(lastProps!.enableHighlighter).toBe(false); // must be explicitly off (engine default is true)
    expect(lastProps!.fillHeight).toBe(true);
    expect(lastProps!.timeLimitSeconds).toBeUndefined();
    expect(lastProps!.policyOverrides).toEqual({ autoRecord: true });
    expect(lastProps!.speakingTiming).toEqual({ gapSeconds: 1 });
  });

  it("copy override wins over the default", () => {
    const custom = { __copy: "custom" } as unknown as RunnerProps["copy"];
    render(<ExamSkillRunner {...base} skill="reading" examMode copy={custom} />);
    expect(lastProps!.copy).toBe(custom);
  });

  it("exam mode: forwards policyOverrides and onViolation (per-center anti-cheat rules)", () => {
    const onViolation = vi.fn();
    const policyOverrides = { antiCheat: true } as RunnerProps["policyOverrides"];
    render(
      <ExamSkillRunner
        {...base}
        skill="reading"
        examMode
        policyOverrides={policyOverrides}
        onViolation={onViolation}
      />,
    );
    expect(lastProps!.policyOverrides).toEqual({ antiCheat: true });
    expect(lastProps!.onViolation).toBe(onViolation);
  });

  it("practice mode: forwards timeLimitSeconds, and gates engine onViolation on antiCheat (anti-leak)", () => {
    const onViolation = vi.fn();
    // Without antiCheat policy the wrapper must NOT hand onViolation to the engine — a
    // fullscreen-only center must not trigger engine copy/blur/leave-tab reporting. The
    // wrapper still emits exit-fullscreen itself, independently of this forwarding.
    const { rerender } = render(
      <ExamSkillRunner
        {...base}
        skill="listening"
        examMode={false}
        timeLimitSeconds={1800}
        onViolation={onViolation}
      />,
    );
    expect(lastProps!.mode).toBe("practice");
    expect(lastProps!.timeLimitSeconds).toBe(1800);
    expect(lastProps!.onViolation).toBeUndefined();

    // With antiCheat on, the engine receives onViolation (the objective + anti-cheat take flow).
    rerender(
      <ExamSkillRunner
        {...base}
        skill="listening"
        examMode={false}
        timeLimitSeconds={1800}
        policyOverrides={{ antiCheat: true }}
        onViolation={onViolation}
      />,
    );
    expect(lastProps!.onViolation).toBe(onViolation);
  });

  it("enableHighlighter override is honored in exam mode (false)", () => {
    render(<ExamSkillRunner {...base} skill="reading" examMode enableHighlighter={false} />);
    expect(lastProps!.enableHighlighter).toBe(false);
  });

  it("enableHighlighter override is honored in practice mode (true)", () => {
    render(
      <ExamSkillRunner {...base} skill="listening" examMode={false} enableHighlighter />,
    );
    expect(lastProps!.enableHighlighter).toBe(true);
  });

  it("exam mode: enableHighlighter defaults to true when not provided", () => {
    render(<ExamSkillRunner {...base} skill="reading" examMode />);
    expect(lastProps!.enableHighlighter).toBe(true);
  });

  it("forwards runnerRef to the engine SkillRunner: ref.current.submit() invokes onSubmit", () => {
    const onSubmit = vi.fn();
    const ref = createRef<SkillRunnerHandle>();
    render(
      <ExamSkillRunner
        {...base}
        skill="writing"
        examMode={false}
        onSubmit={onSubmit}
        runnerRef={ref}
      />,
    );

    expect(ref.current).not.toBeNull();
    act(() => {
      ref.current?.submit();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  describe("fullscreen policy (D1/GC5 app-side lockdown)", () => {
    let currentEl: Element | null = null;

    beforeEach(() => {
      currentEl = null;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => currentEl,
      });
      document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      Reflect.deleteProperty(document, "fullscreenElement");
    });

    it("shows the start FullscreenGate and does not mount the engine runner when not fullscreen", () => {
      render(<ExamSkillRunner {...base} skill="reading" examMode fullscreen />);

      expect(
        screen.getByRole("button", { name: /vào toàn màn hình/i }),
      ).toBeInTheDocument();
      expect(lastProps).toBeNull();
    });

    it("renders the runner as before when fullscreen is not requested", () => {
      render(<ExamSkillRunner {...base} skill="reading" examMode fullscreen={false} />);

      expect(
        screen.queryByRole("button", { name: /vào toàn màn hình/i }),
      ).not.toBeInTheDocument();
      expect(lastProps).not.toBeNull();
      expect(lastProps!.mode).toBe("exam");
    });

    it("resume-gate: hides content (opacity-0/blur) but keeps the SAME engine instance mounted (W1 fix)", async () => {
      const { container } = render(
        <ExamSkillRunner {...base} skill="reading" examMode fullscreen />,
      );

      // start-gate: engine not mounted at all (D2).
      expect(lastProps).toBeNull();
      expect(mountCount).toBe(0);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /vào toàn màn hình/i }));
        await Promise.resolve();
      });
      act(() => {
        currentEl = document.documentElement;
        document.dispatchEvent(new Event("fullscreenchange"));
      });

      // ready: engine mounts exactly once.
      expect(lastProps).not.toBeNull();
      expect(mountCount).toBe(1);

      act(() => {
        currentEl = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      });

      // resume-gate: overlay is back and the content wrapper carries the hiding classes...
      expect(screen.getByText("Bạn đã thoát toàn màn hình")).toBeInTheDocument();
      const hiddenWrapper = container.querySelector(".opacity-0.blur-md");
      expect(hiddenWrapper).not.toBeNull();
      expect(hiddenWrapper).toHaveClass("pointer-events-none", "select-none", "opacity-0", "blur-md");
      // ...but the engine SkillRunner was never unmounted/re-created (mountCount still 1) — the
      // whole point of the W1 fix (countdown/MediaRecorder must survive the exit/resume cycle).
      expect(mountCount).toBe(1);
    });
  });
});
