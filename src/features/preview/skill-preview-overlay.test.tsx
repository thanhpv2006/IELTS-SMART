import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type RunnerProps = ComponentProps<typeof import("@novaforge-team/ielts-exam-engine").SkillRunner>;

let lastProps: RunnerProps | null = null;

// The real runner is heavy (audio, timers, portals) and this suite only cares about the
// configuration the overlay applies to it. isRLGroupType has to be part of the mock because
// preview-mapping imports it at module scope. groupChooseResults/summarizeChooseBlock/parseOptionList are pure and
// come from the real module.
vi.mock("@novaforge-team/ielts-exam-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@novaforge-team/ielts-exam-engine")>();
  return {
    SkillRunner: (props: RunnerProps) => {
      lastProps = props;
      return <div data-testid="engine-runner" />;
    },
    defaultCopyEn: { __copy: "en" },
    isRLGroupType: (t: string) => t === "gap_fill" || t === "tfng",
    groupChooseResults: actual.groupChooseResults,
    summarizeChooseBlock: actual.summarizeChooseBlock,
    parseOptionList: actual.parseOptionList,
  };
});

import { SkillPreviewOverlay } from "./skill-preview-overlay";
import type { PreviewQuestion } from "./types";

function draft(
  skill: string,
  part: number,
  prompt: string,
  metadata: Record<string, unknown>,
): PreviewQuestion {
  return { skill, part, prompt, metadata };
}

function readingGroup(numbers: number[]) {
  return {
    type: "gap_fill",
    items: numbers.map((n) => ({ number: n, prompt: `Q${n}`, answer_key: [`a${n}`], explanation: `e${n}` })),
  };
}

const NOTE = "Bản nháp chưa lưu.";

beforeEach(() => {
  lastProps = null;
});

describe("SkillPreviewOverlay — exam mode", () => {
  const questions = [
    draft("reading", 1, "<h2>P1</h2>", { groups: [readingGroup([1, 2])] }),
    draft("reading", 2, "<h2>P2</h2>", { groups: [readingGroup([1, 2])] }),
  ];

  it("runs the engine in practice mode with every exam guard switched off", () => {
    render(
      <SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={() => {}} />,
    );

    expect(screen.getByTestId("engine-runner")).toBeInTheDocument();
    expect(lastProps!.mode).toBe("practice");
    expect(lastProps!.policyOverrides).toMatchObject({
      antiCheat: false,
      timed: false,
      autoRecord: false,
    });
  });

  it("hides the engine's submit button, since a preview has nothing to hand in", () => {
    render(
      <SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={() => {}} />,
    );

    expect(lastProps!.showSubmit).toBe(false);
  });

  it("never hands the engine a draftKey, so preview state cannot reach the real draft store", () => {
    render(
      <SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={() => {}} />,
    );

    expect(lastProps!.draftKey).toBeUndefined();
  });

  it("gives every question a unique id even when the drafts repeat question numbers", () => {
    render(
      <SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={() => {}} />,
    );

    const ids = lastProps!.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(lastProps!.questions).toHaveLength(2);
  });

  it("wraps the runner in rl-take so host table and list styling applies", () => {
    const { container } = render(
      <SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={() => {}} />,
    );

    expect(container.querySelector(".rl-take")).not.toBeNull();
  });

  it("reports placeholder assets instead of letting the browser load them", () => {
    render(
      <SkillPreviewOverlay
        note={NOTE}
        mode="exam"
        skill="listening"
        questions={[draft("listening", 1, "L", { audio_url: "__AUDIO_URL__", groups: [readingGroup([1])] })]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/__AUDIO_URL__/)).toBeInTheDocument();
    expect(lastProps!.questions[0].metadata.audio_url).toBe("");
  });

  it("explains itself instead of mounting the engine when the skill has no drafts", () => {
    render(<SkillPreviewOverlay note={NOTE} mode="exam" skill="writing" questions={questions} onClose={() => {}} />);

    expect(screen.queryByTestId("engine-runner")).not.toBeInTheDocument();
    expect(screen.getByText(/chưa có câu nào/i)).toBeInTheDocument();
  });
});

describe("SkillPreviewOverlay — result mode", () => {
  it("renders the answer key without touching the engine at all", () => {
    render(
      <SkillPreviewOverlay
        note={NOTE}
        mode="result"
        skill="reading"
        questions={[draft("reading", 1, "<h2>P1</h2>", { groups: [readingGroup([1])] })]}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTestId("engine-runner")).not.toBeInTheDocument();
    expect(lastProps).toBeNull();
    expect(screen.getByText("Câu 1.")).toBeInTheDocument();
  });

  it("lists the accepted variants next to the correct answer", () => {
    const group = readingGroup([1, 2]);
    Object.assign(group.items[0], { accepted_variants: ["color", "colours"] });

    render(
      <SkillPreviewOverlay
        note={NOTE}
        mode="result"
        skill="reading"
        questions={[draft("reading", 1, "<h2>P1</h2>", { groups: [group] })]}
        onClose={() => {}}
      />,
    );

    expect(screen.getAllByText(/Cũng chấp nhận:/)).toHaveLength(1);
    expect(screen.getByText("color, colours")).toBeInTheDocument();
  });

  it("says so when the draft carries no gradable item", () => {
    render(
      <SkillPreviewOverlay
        note={NOTE}
        mode="result"
        skill="reading"
        questions={[draft("reading", 3, "", { groups: [] })]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/chưa có câu nào để dựng đáp án/i)).toBeInTheDocument();
  });
});

describe("SkillPreviewOverlay — fullscreen", () => {
  const questions = [draft("reading", 1, "<h2>P1</h2>", { groups: [readingGroup([1])] })];

  function stubFullscreen({ enabled, active }: { enabled: boolean; active: boolean }) {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: enabled });
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: active ? document.body : null });
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: requestFullscreen });
    return { exitFullscreen, requestFullscreen };
  }

  afterEach(() => {
    for (const key of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"] as const) {
      delete (document as unknown as Record<string, unknown>)[key];
    }
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).requestFullscreen;
  });

  it("puts the overlay itself into fullscreen", () => {
    const { requestFullscreen } = stubFullscreen({ enabled: true, active: false });
    render(<SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Toàn màn hình" }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toBe(screen.getByTestId("skill-preview-overlay"));
  });

  it("offers no fullscreen button where the browser cannot do it", () => {
    stubFullscreen({ enabled: false, active: false });
    render(<SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={() => {}} />);

    expect(screen.queryByRole("button", { name: "Toàn màn hình" })).not.toBeInTheDocument();
  });

  it("leaves fullscreen before closing", async () => {
    const { exitFullscreen } = stubFullscreen({ enabled: true, active: true });
    const onClose = vi.fn();
    render(<SkillPreviewOverlay note={NOTE} mode="exam" skill="reading" questions={questions} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(exitFullscreen.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });
});

describe("SkillPreviewOverlay — note", () => {
  it("shows the caller's note under the title", () => {
    render(
      <SkillPreviewOverlay
        note="Bản xem trước."
        mode="exam"
        skill="reading"
        questions={[draft("reading", 1, "<h2>P1</h2>", { groups: [readingGroup([1])] })]}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Bản xem trước.")).toBeInTheDocument();
  });
});
